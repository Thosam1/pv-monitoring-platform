"""Fleet overview tools.

Provides tools for site-wide aggregation and fleet status.
"""

import pandas as pd

from database import engine, get_anchor_date
from models.responses import FleetOverviewResponse, FleetStatus, FleetProduction
from queries.builders import (
    build_fleet_power_query,
    build_fleet_energy_query,
    build_fleet_count_query,
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

    return FleetOverviewResponse(
        timestamp=anchor.isoformat(),
        status=status,
        production=production,
        summary=summary,
    ).model_dump()
