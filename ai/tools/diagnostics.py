"""Error code diagnostics tools.

Provides tools for diagnosing system errors and suggesting fixes.
"""

from typing import Annotated

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from error_codes import get_error_definition
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

    return DiagnosticsReportResponse(
        loggerId=logger_id,
        loggerType=logger_type,
        period=f"Last {days} days",
        overallHealth=overall_health,
        issueCount=len(issues),
        issues=issues[: settings.diagnostic_issue_limit],
        summary=summary,
    ).model_dump()
