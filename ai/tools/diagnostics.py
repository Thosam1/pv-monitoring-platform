"""Error code diagnostics tools.

Provides tools for diagnosing system errors and suggesting fixes.
"""

from typing import Annotated

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from error_codes import get_error_definition
from models.context import (
    build_next_step,
    build_operational_insight,
    ColorScheme,
    ContextEnvelope,
    DisplayMode,
    InsightSeverity,
    NextStepPriority,
    UIComponentHint,
    UISuggestion,
)
from models.responses import DiagnosticsReportResponse, DiagnosticIssue
from queries.builders import build_logger_type_query, build_error_scan_query


def diagnose_error_codes(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    days: Annotated[int, Field(description="Number of days to scan for errors", ge=1, le=30)] = 7,
) -> dict:
    """Diagnose system errors by scanning metadata for error codes.

    Returns human-readable descriptions and suggested fixes.

    Args:
        logger_id: Logger/inverter serial number
        days: Number of days to scan for errors (1-30)

    Returns:
        DiagnosticsReportResponse with issues and fixes
    """
    # First get the logger type
    type_query = build_logger_type_query()
    type_df = pd.read_sql(type_query, engine, params={"logger_id": logger_id})

    if type_df.empty:
        return DiagnosticsReportResponse(
            loggerId=logger_id,
            message="Logger not found",
        ).model_dump()

    logger_type = type_df["loggerType"].iloc[0]

    # Query metadata for error codes
    query, _ = build_error_scan_query()
    df = pd.read_sql(query, engine, params={"logger_id": logger_id, "days": days})

    # Parse errors from metadata
    error_counts: dict = {}

    for _, row in df.iterrows():
        metadata = row["metadata"]
        if isinstance(metadata, dict) and "errorCode" in metadata:
            code = metadata["errorCode"]
            if code not in error_counts:
                error_counts[code] = {
                    "count": 0,
                    "firstSeen": row["timestamp"],
                    "lastSeen": row["timestamp"],
                }
            error_counts[code]["count"] += 1
            error_counts[code]["lastSeen"] = row["timestamp"]

    # Build issues list
    issues = []
    for code, stats in error_counts.items():
        definition = get_error_definition(logger_type, code)
        if definition is None:
            definition = {
                "description": f"Unknown error code: {code}",
                "severity": "warning",
                "fix": "Consult manufacturer documentation",
            }

        first_seen = stats["firstSeen"]
        last_seen = stats["lastSeen"]

        issues.append(
            DiagnosticIssue(
                code=code,
                description=definition["description"],
                severity=definition["severity"],
                occurrences=stats["count"],
                firstSeen=(
                    first_seen.isoformat() if hasattr(first_seen, "isoformat") else str(first_seen)
                ),
                lastSeen=(
                    last_seen.isoformat() if hasattr(last_seen, "isoformat") else str(last_seen)
                ),
                suggestedFix=definition["fix"],
            )
        )

    # Sort by severity (critical first) then by count
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda x: (severity_order.get(x.severity, 3), -x.occurrences))

    # Determine overall health
    if any(i.severity == "critical" for i in issues):
        overall_health = "critical"
    elif any(i.severity == "warning" for i in issues):
        overall_health = "warning"
    elif issues:
        overall_health = "info"
    else:
        overall_health = "good"

    summary = (
        f"Found {len(issues)} issue(s) - System health: {overall_health.upper()}"
        if issues
        else "No errors detected - System health: GOOD"
    )

    # Build user-friendly context
    context = _build_diagnostics_context(
        logger_id=logger_id,
        logger_type=logger_type,
        days=days,
        issues=issues,
        overall_health=overall_health,
    )

    return DiagnosticsReportResponse(
        loggerId=logger_id,
        loggerType=logger_type,
        period=f"Last {days} days",
        overallHealth=overall_health,
        issueCount=len(issues),
        issues=issues[: settings.diagnostic_issue_limit],
        summary=summary,
        context=context,
    ).model_dump()


def _build_diagnostics_context(
    logger_id: str,
    logger_type: str,
    days: int,
    issues: list[DiagnosticIssue],
    overall_health: str,
) -> ContextEnvelope:
    """Build user-friendly context for diagnostics report response."""
    # Count issues by severity
    critical_count = sum(1 for i in issues if i.severity == "critical")
    warning_count = sum(1 for i in issues if i.severity == "warning")
    info_count = sum(1 for i in issues if i.severity == "info")

    # Build summary
    if not issues:
        summary = (
            f"Great news! Your inverter {logger_id} has no error codes in the past {days} days. "
            f"The system appears to be operating normally without any issues."
        )
    elif critical_count > 0:
        summary = (
            f"Attention needed: Found {critical_count} critical issue(s) on inverter {logger_id}. "
            f"These errors may be affecting your production and should be addressed promptly."
        )
    elif warning_count > 0:
        summary = (
            f"Your inverter {logger_id} has {warning_count} warning(s) from the past {days} days. "
            f"While not critical, these should be monitored or addressed when convenient."
        )
    else:
        summary = (
            f"Inverter {logger_id} shows {info_count} informational message(s) from the past {days} days. "
            f"These are generally normal operational notes."
        )

    # Build insights
    insights = []

    # Overall health insight
    health_severity = (
        InsightSeverity.CRITICAL if overall_health == "critical"
        else InsightSeverity.WARNING if overall_health == "warning"
        else InsightSeverity.INFO
    )
    health_descriptions = {
        "good": "No errors detected - your system is running cleanly.",
        "info": "Some informational messages present, but no action required.",
        "warning": "Warnings detected that may need attention.",
        "critical": "Critical errors found that require immediate attention.",
    }
    insights.append(
        build_operational_insight(
            title=f"System health: {overall_health.upper()}",
            description=health_descriptions.get(overall_health, ""),
            metric=f"{len(issues)} issue(s)",
            severity=health_severity,
        )
    )

    # Most frequent/severe issue insight
    if issues:
        top_issue = issues[0]  # Already sorted by severity and count
        insights.append(
            build_operational_insight(
                title=f"Top issue: {top_issue.code}",
                description=f"{top_issue.description} - Occurred {top_issue.occurrences} time(s).",
                metric=f"{top_issue.occurrences}x",
                severity=(
                    InsightSeverity.CRITICAL if top_issue.severity == "critical"
                    else InsightSeverity.WARNING if top_issue.severity == "warning"
                    else InsightSeverity.INFO
                ),
            )
        )

        # Add suggested fix as insight
        if top_issue.suggestedFix:
            insights.append(
                build_operational_insight(
                    title="Recommended action",
                    description=top_issue.suggestedFix,
                    severity=InsightSeverity.INFO,
                )
            )

    # Build next steps
    next_steps = []

    if critical_count > 0:
        next_steps.append(
            build_next_step(
                action="Check system performance",
                reason="Critical errors may be impacting production",
                priority=NextStepPriority.URGENT,
                tool_hint="analyze_inverter_health",
                params={"logger_id": logger_id, "days": days},
            )
        )
        next_steps.append(
            build_next_step(
                action="View production patterns",
                reason="See if errors correlate with production drops",
                priority=NextStepPriority.RECOMMENDED,
                tool_hint="get_power_curve",
                params={"logger_id": logger_id},
            )
        )
    elif warning_count > 0:
        next_steps.append(
            build_next_step(
                action="Monitor system health",
                reason="Keep an eye on warning trends",
                priority=NextStepPriority.RECOMMENDED,
                tool_hint="analyze_inverter_health",
                params={"logger_id": logger_id, "days": days},
            )
        )
        next_steps.append(
            build_next_step(
                action="Check system efficiency",
                reason="Verify performance isn't affected",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="calculate_performance_ratio",
                params={"logger_id": logger_id},
            )
        )
    else:
        next_steps.append(
            build_next_step(
                action="View production summary",
                reason="See how well your healthy system is performing",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="get_power_curve",
                params={"logger_id": logger_id},
            )
        )
        next_steps.append(
            build_next_step(
                action="Calculate your savings",
                reason="See the financial benefit of this clean operation",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="calculate_financial_savings",
                params={"logger_id": logger_id},
            )
        )

    next_steps.append(
        build_next_step(
            action="Compare with other inverters",
            reason="Check if issues are isolated to this unit",
            priority=NextStepPriority.OPTIONAL,
            tool_hint="compare_loggers",
        )
    )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS if overall_health == "good"
        else ColorScheme.DANGER if overall_health == "critical"
        else ColorScheme.WARNING if overall_health == "warning"
        else ColorScheme.NEUTRAL
    )

    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.DATA_TABLE if issues else UIComponentHint.STATUS_BADGE,
        display_mode=DisplayMode.DETAILED if issues else DisplayMode.SUMMARY,
        color_scheme=color_scheme,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
        alert=f"{critical_count} critical error(s) require attention" if critical_count > 0 else None,
    )
