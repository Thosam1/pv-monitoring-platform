"""Fleet overview tools.

Provides tools for site-wide aggregation and fleet status.
"""

from datetime import datetime, timezone
from typing import Optional

import pandas as pd

from database import engine, get_anchor_date
from models.context import (
    build_next_step,
    build_operational_insight,
    build_performance_insight,
    ColorScheme,
    ContextEnvelope,
    DisplayMode,
    InsightSeverity,
    NextStepPriority,
    UIComponentHint,
    UISuggestion,
)
from models.responses import (
    DateMismatchInfo,
    FleetOverviewResponse,
    FleetProduction,
    FleetStatus,
)
from queries.builders import (
    build_fleet_count_query,
    build_fleet_energy_query,
    build_fleet_power_query,
)


def get_fleet_overview() -> dict:
    """Get high-level status of the entire solar fleet (site-wide).

    Returns total current power, total daily energy, and active device counts.
    Use this for questions like "How is the site performing right now?"

    Returns:
        FleetOverviewResponse with fleet status and production metrics
    """
    # 1. Get real-time total power (sum of latest reading per logger)
    power_query = build_fleet_power_query()
    power_df = pd.read_sql(power_query, engine)

    # 2. Get total energy generated today
    energy_query = build_fleet_energy_query()
    energy_df = pd.read_sql(energy_query, engine)

    # 3. Get total registered devices count
    count_query = build_fleet_count_query()
    count_df = pd.read_sql(count_query, engine)

    total_loggers = int(count_df["totalCount"].iloc[0]) if not count_df.empty else 0
    active_loggers = (
        int(power_df["activeLoggers"].iloc[0])
        if not power_df.empty and pd.notna(power_df["activeLoggers"].iloc[0])
        else 0
    )
    total_power = (
        float(power_df["totalPowerWatts"].iloc[0])
        if not power_df.empty and pd.notna(power_df["totalPowerWatts"].iloc[0])
        else 0.0
    )
    total_energy = (
        float(energy_df["totalDailyKwh"].iloc[0])
        if not energy_df.empty and pd.notna(energy_df["totalDailyKwh"].iloc[0])
        else 0.0
    )
    avg_irradiance = (
        float(power_df["avgIrradiance"].iloc[0])
        if not power_df.empty and pd.notna(power_df["avgIrradiance"].iloc[0])
        else 0.0
    )

    # Calculate health status
    percent_online = (active_loggers / total_loggers * 100) if total_loggers > 0 else 0

    if percent_online > 90:
        fleet_health = "Healthy"
    elif percent_online > 50:
        fleet_health = "Degraded"
    else:
        fleet_health = "Critical"

    status = FleetStatus(
        totalLoggers=total_loggers,
        activeLoggers=active_loggers,
        percentOnline=round(percent_online, 1),
        fleetHealth=fleet_health,
    )

    production = FleetProduction(
        currentTotalPowerWatts=round(total_power, 2),
        todayTotalEnergyKwh=round(total_energy, 2),
        siteAvgIrradiance=round(avg_irradiance, 2),
    )

    summary = f"Site generating {total_power / 1000:.1f} kW total. {active_loggers}/{total_loggers} devices active."

    # Use anchor date (latest data timestamp) instead of current time
    anchor = get_anchor_date()
    current_date = datetime.now(timezone.utc)

    # Detect date mismatch between current date and anchor date
    anchor_date_only = anchor.date()
    current_date_only = current_date.date()
    days_diff = (current_date_only - anchor_date_only).days

    date_mismatch: Optional[DateMismatchInfo] = None
    if days_diff > 0:
        date_mismatch = DateMismatchInfo(
            requestedDate=current_date_only.isoformat(),
            actualDataDate=anchor_date_only.isoformat(),
            daysDifference=days_diff,
            isHistorical=True,
        )

    # Build user-friendly context
    context = _build_fleet_context(
        total_loggers=total_loggers,
        active_loggers=active_loggers,
        percent_online=percent_online,
        fleet_health=fleet_health,
        total_power=total_power,
        total_energy=total_energy,
        avg_irradiance=avg_irradiance,
        date_mismatch=date_mismatch,
    )

    return FleetOverviewResponse(
        timestamp=anchor.isoformat(),
        status=status,
        production=production,
        summary=summary,
        dateMismatch=date_mismatch,
        context=context,
    ).model_dump()


def _build_fleet_context(
    total_loggers: int,
    active_loggers: int,
    percent_online: float,
    fleet_health: str,
    total_power: float,
    total_energy: float,
    avg_irradiance: float,
    date_mismatch: Optional[DateMismatchInfo] = None,
) -> ContextEnvelope:
    """Build user-friendly context for fleet overview response."""
    # Build summary
    power_kw = total_power / 1000
    offline_count = total_loggers - active_loggers

    # Prepend date mismatch warning to summary if applicable
    date_warning = ""
    if date_mismatch and date_mismatch.isHistorical:
        days_text = "day" if date_mismatch.daysDifference == 1 else "days"
        date_warning = (
            f"Note: This data is from {date_mismatch.actualDataDate} "
            f"({date_mismatch.daysDifference} {days_text} ago). "
        )

    if fleet_health == "Healthy":
        summary = (
            f"{date_warning}Your solar site is running smoothly! All {active_loggers} inverters are online "
            f"and generating {power_kw:.1f} kW of clean power. "
            f"You've already produced {total_energy:.1f} kWh today."
        )
    elif fleet_health == "Degraded":
        summary = (
            f"{date_warning}Your site is generating {power_kw:.1f} kW, but {offline_count} of your {total_loggers} "
            f"inverters appear to be offline. Today's production is {total_energy:.1f} kWh so far."
        )
    else:  # Critical
        summary = (
            f"{date_warning}Attention needed: Only {active_loggers} of {total_loggers} inverters are online. "
            f"Your site is generating just {power_kw:.1f} kW. Check your system status."
        )

    # Build insights
    insights = []

    # Fleet health insight
    if fleet_health == "Healthy":
        insights.append(
            build_operational_insight(
                title="All systems operational",
                description=f"All {active_loggers} inverters are communicating and producing power.",
                metric=f"{percent_online:.0f}%",
                severity=InsightSeverity.INFO,
            )
        )
    elif fleet_health == "Degraded":
        insights.append(
            build_operational_insight(
                title=f"{offline_count} device(s) offline",
                description=f"Some inverters aren't reporting data. This could affect your production.",
                metric=f"{percent_online:.0f}%",
                severity=InsightSeverity.WARNING,
            )
        )
    else:
        insights.append(
            build_operational_insight(
                title="Many devices offline",
                description=f"Only {active_loggers} of {total_loggers} devices are responding.",
                metric=f"{percent_online:.0f}%",
                severity=InsightSeverity.CRITICAL,
            )
        )

    # Power output insight
    if total_power > 0:
        insights.append(
            build_performance_insight(
                title="Current generation",
                description=f"Your site is currently producing {power_kw:.1f} kW of power.",
                metric=f"{power_kw:.1f} kW",
            )
        )

    # Irradiance insight
    if avg_irradiance > 0:
        irr_quality = (
            "excellent" if avg_irradiance > 800
            else "good" if avg_irradiance > 500
            else "moderate" if avg_irradiance > 200
            else "low"
        )
        insights.append(
            build_performance_insight(
                title=f"{irr_quality.capitalize()} sunlight",
                description=f"Current irradiance is {avg_irradiance:.0f} W/m².",
                metric=f"{avg_irradiance:.0f} W/m²",
            )
        )

    # Build next steps
    next_steps = []

    if fleet_health != "Healthy":
        next_steps.append(
            build_next_step(
                action="Check which devices are offline",
                reason=f"{offline_count} device(s) not reporting",
                priority=NextStepPriority.URGENT if fleet_health == "Critical" else NextStepPriority.RECOMMENDED,
                tool_hint="list_loggers",
            )
        )

    next_steps.append(
        build_next_step(
            action="View detailed performance for your best inverter",
            reason="See production curves and efficiency",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="get_power_curve",
        )
    )

    next_steps.append(
        build_next_step(
            action="Calculate your energy savings",
            reason=f"See how much {total_energy:.1f} kWh saves you",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="calculate_financial_savings",
        )
    )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS if fleet_health == "Healthy"
        else ColorScheme.DANGER if fleet_health == "Critical"
        else ColorScheme.WARNING
    )

    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.METRIC_GRID,
        display_mode=DisplayMode.STANDARD,
        highlight_metric="totalPowerWatts",
        color_scheme=color_scheme,
    )

    # Build alert with date mismatch priority
    alert = None
    if date_mismatch and date_mismatch.isHistorical:
        days_text = "day" if date_mismatch.daysDifference == 1 else "days"
        alert = f"Showing data from {date_mismatch.actualDataDate} ({date_mismatch.daysDifference} {days_text} ago)"
    elif fleet_health == "Critical":
        alert = f"Only {percent_online:.0f}% of devices online"

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
        alert=alert,
    )
