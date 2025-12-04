"""Financial savings calculation tools.

Provides tools for calculating money saved and CO2 offset from solar generation.
"""

from typing import Annotated

import pandas as pd
from pydantic import Field

from config import settings
from database import engine, get_anchor_date_str
from models.context import (
    build_financial_insight,
    build_next_step,
    ColorScheme,
    ContextEnvelope,
    DisplayMode,
    InsightSeverity,
    NextStepPriority,
    UIComponentHint,
    UISuggestion,
)
from models.responses import FinancialReportResponse, FinancialPeriod
from queries.builders import build_financial_query


def calculate_financial_savings(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    start_date: Annotated[str, Field(description="Start date in YYYY-MM-DD format")],
    end_date: Annotated[
        str | None, Field(description="End date in YYYY-MM-DD format (optional, defaults to today)")
    ] = None,
    electricity_rate: Annotated[
        float, Field(description="Electricity rate in $/kWh (default 0.20)", ge=0.01, le=1.0)
    ] = 0.20,
) -> dict:
    """Calculate financial savings from solar generation.

    Returns money saved, CO2 offset, and equivalent trees planted.

    Args:
        logger_id: Logger/inverter serial number
        start_date: Start date in YYYY-MM-DD format
        end_date: Optional end date (defaults to anchor date for time-agnostic operation)
        electricity_rate: Electricity rate in $/kWh

    Returns:
        FinancialReportResponse with savings calculations
    """
    # Default end_date to anchor date (latest data) instead of today
    if end_date is None:
        end_date = get_anchor_date_str()

    query = build_financial_query()
    df = pd.read_sql(
        query,
        engine,
        params={"logger_id": logger_id, "start_date": start_date, "end_date": end_date},
    )

    period = FinancialPeriod(start=start_date, end=end_date)

    if df.empty:
        return FinancialReportResponse(
            loggerId=logger_id,
            period=period,
            message="No energy data found for the specified period",
        ).model_dump()

    total_kwh = df["dailyKwh"].sum()
    savings_usd = total_kwh * electricity_rate
    co2_offset_kg = total_kwh * settings.co2_per_kwh
    trees_equivalent = co2_offset_kg / settings.kg_co2_per_tree_year

    # Build user-friendly context
    context = _build_financial_context(
        logger_id=logger_id,
        start_date=start_date,
        end_date=end_date,
        days_with_data=len(df),
        total_kwh=total_kwh,
        savings_usd=savings_usd,
        co2_offset_kg=co2_offset_kg,
        trees_equivalent=trees_equivalent,
        electricity_rate=electricity_rate,
    )

    return FinancialReportResponse(
        loggerId=logger_id,
        period=period,
        daysWithData=len(df),
        totalEnergyKwh=round(total_kwh, 2),
        electricityRateUsd=electricity_rate,
        savingsUsd=round(savings_usd, 2),
        co2OffsetKg=round(co2_offset_kg, 2),
        treesEquivalent=round(trees_equivalent, 1),
        summary=f"Generated {total_kwh:.1f} kWh, saving ${savings_usd:.2f} and offsetting {co2_offset_kg:.1f} kg of CO2",
        context=context,
    ).model_dump()


def _build_financial_context(
    logger_id: str,
    start_date: str,
    end_date: str,
    days_with_data: int,
    total_kwh: float,
    savings_usd: float,
    co2_offset_kg: float,
    trees_equivalent: float,
    electricity_rate: float,
) -> ContextEnvelope:
    """Build user-friendly context for financial report response."""
    # Calculate daily averages
    avg_daily_kwh = total_kwh / days_with_data if days_with_data > 0 else 0
    avg_daily_savings = savings_usd / days_with_data if days_with_data > 0 else 0

    # Build summary with relatable comparisons
    summary = (
        f"Your solar panels have saved you ${savings_usd:.2f} over the past {days_with_data} days! "
        f"That's ${avg_daily_savings:.2f} per day on average. "
        f"You've also prevented {co2_offset_kg:.0f} kg of CO2 from entering the atmosphere."
    )

    # Build insights
    insights = []

    # Money saved insight
    monthly_projection = avg_daily_savings * 30
    yearly_projection = avg_daily_savings * 365
    insights.append(
        build_financial_insight(
            title="You're saving money",
            description=f"At this rate, you'll save about ${monthly_projection:.0f}/month or ${yearly_projection:.0f}/year.",
            metric=f"${savings_usd:.2f}",
            benchmark=f"${avg_daily_savings:.2f}/day",
        )
    )

    # Environmental impact insight
    if trees_equivalent >= 1:
        insights.append(
            build_financial_insight(
                title="Environmental impact",
                description=f"Your clean energy is equivalent to planting {trees_equivalent:.0f} trees!",
                metric=f"{co2_offset_kg:.0f} kg CO2",
                severity=InsightSeverity.INFO,
            )
        )

    # Energy production insight
    insights.append(
        build_financial_insight(
            title="Energy generated",
            description=f"Your system produced {total_kwh:.1f} kWh - that's {avg_daily_kwh:.1f} kWh per day.",
            metric=f"{total_kwh:.1f} kWh",
        )
    )

    # Build next steps
    next_steps = []

    next_steps.append(
        build_next_step(
            action="Check system efficiency",
            reason="Ensure you're maximizing your savings",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="calculate_performance_ratio",
            params={"logger_id": logger_id},
        )
    )

    next_steps.append(
        build_next_step(
            action="View your power production patterns",
            reason="See when your panels generate the most",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="get_power_curve",
            params={"logger_id": logger_id},
        )
    )

    next_steps.append(
        build_next_step(
            action="Forecast future production",
            reason="Plan ahead for expected savings",
            priority=NextStepPriority.OPTIONAL,
            tool_hint="forecast_production",
            params={"logger_id": logger_id, "days_ahead": 7},
        )
    )

    # Build UI suggestion
    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.METRIC_GRID,
        display_mode=DisplayMode.DETAILED,
        highlight_metric="savingsUsd",
        color_scheme=ColorScheme.SUCCESS,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
    )
