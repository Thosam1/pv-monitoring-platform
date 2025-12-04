"""Production forecasting tools.

Provides tools for forecasting future energy production.
"""

from typing import Annotated
from datetime import timedelta

import pandas as pd
from pydantic import Field

from config import settings
from database import engine, get_anchor_date
from models.context import (
    build_next_step,
    build_performance_insight,
    build_financial_insight,
    ColorScheme,
    ContextEnvelope,
    DisplayMode,
    NextStepPriority,
    UIComponentHint,
    UISuggestion,
)
from models.responses import (
    ProductionForecastResponse,
    ForecastHistoricalStats,
    ForecastDay,
)
from queries.builders import build_forecast_query


def forecast_production(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    days_ahead: Annotated[int, Field(description="Number of days to forecast (1-7)", ge=1, le=7)] = 1,
) -> dict:
    """Forecast energy production for upcoming days.

    Uses historical average as a simple persistence model.

    Args:
        logger_id: Logger/inverter serial number
        days_ahead: Number of days to forecast (1-7)

    Returns:
        ProductionForecastResponse with forecasts
    """
    query = build_forecast_query()
    df = pd.read_sql(query, engine, params={"logger_id": logger_id})

    if df.empty or len(df) < settings.forecast_min_history_days:
        return ProductionForecastResponse(
            loggerId=logger_id,
            message=f"Insufficient historical data for forecasting (need at least {settings.forecast_min_history_days} days)",
        ).model_dump()

    # Calculate statistics
    avg_daily = df["dailyKwh"].mean()
    std_daily = df["dailyKwh"].std()
    min_daily = df["dailyKwh"].min()
    max_daily = df["dailyKwh"].max()

    # Determine confidence based on variance
    cv = std_daily / avg_daily if avg_daily > 0 else 1  # Coefficient of variation
    if cv < 0.15:
        confidence = "high"
    elif cv < 0.30:
        confidence = "medium"
    else:
        confidence = "low"

    # Generate forecasts using anchor date (latest data) as base
    forecasts = []
    base_date = get_anchor_date()
    for i in range(1, days_ahead + 1):
        forecast_date = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
        forecasts.append(
            ForecastDay(
                date=forecast_date,
                expectedKwh=round(avg_daily, 2),
                rangeMin=round(max(0, avg_daily - std_daily), 2),
                rangeMax=round(avg_daily + std_daily, 2),
                confidence=confidence,
            )
        )

    historical_stats = ForecastHistoricalStats(
        averageKwh=round(avg_daily, 2),
        stdDevKwh=round(std_daily, 2),
        minKwh=round(min_daily, 2),
        maxKwh=round(max_daily, 2),
    )

    # Build user-friendly context
    context = _build_forecast_context(
        logger_id=logger_id,
        days_ahead=days_ahead,
        avg_daily=avg_daily,
        std_daily=std_daily,
        min_daily=min_daily,
        max_daily=max_daily,
        confidence=confidence,
        based_on_days=len(df),
    )

    return ProductionForecastResponse(
        loggerId=logger_id,
        method="historical_average",
        basedOnDays=len(df),
        historicalStats=historical_stats,
        forecasts=forecasts,
        summary=f"Expected ~{avg_daily:.1f} kWh/day based on last {len(df)} days ({confidence} confidence)",
        context=context,
    ).model_dump()


def _build_forecast_context(
    logger_id: str,
    days_ahead: int,
    avg_daily: float,
    std_daily: float,
    min_daily: float,
    max_daily: float,
    confidence: str,
    based_on_days: int,
) -> ContextEnvelope:
    """Build user-friendly context for forecast response."""
    # Calculate projections
    total_expected = avg_daily * days_ahead
    range_min = max(0, avg_daily - std_daily) * days_ahead
    range_max = (avg_daily + std_daily) * days_ahead

    # Estimate savings (using default rate of $0.20/kWh)
    expected_savings = total_expected * 0.20

    # Build summary
    day_word = "day" if days_ahead == 1 else f"{days_ahead} days"
    if confidence == "high":
        summary = (
            f"Based on your recent production history, expect about {avg_daily:.1f} kWh per day "
            f"over the next {day_word}. Your system has been very consistent, so this forecast "
            f"is quite reliable."
        )
    elif confidence == "medium":
        summary = (
            f"Looking ahead {day_word}: expect around {avg_daily:.1f} kWh per day "
            f"(could range from {max(0, avg_daily - std_daily):.1f} to {avg_daily + std_daily:.1f} kWh). "
            f"Some variation is normal based on weather."
        )
    else:
        summary = (
            f"Your production has varied quite a bit recently, so forecasts are less certain. "
            f"Expect roughly {avg_daily:.1f} kWh per day over the next {day_word}, "
            f"but it could be anywhere from {min_daily:.1f} to {max_daily:.1f} kWh."
        )

    # Build insights
    insights = []

    # Production forecast insight
    insights.append(
        build_performance_insight(
            title=f"Expected: ~{total_expected:.1f} kWh total",
            description=f"Based on your average of {avg_daily:.1f} kWh/day over the past {based_on_days} days.",
            metric=f"{avg_daily:.1f} kWh/day",
            benchmark=f"range: {range_min:.1f}-{range_max:.1f} kWh",
        )
    )

    # Confidence insight
    confidence_descriptions = {
        "high": "Your production has been very consistent, making this forecast reliable.",
        "medium": "Some day-to-day variation is normal; actual production may differ.",
        "low": "High variability means actual production could differ significantly.",
    }
    insights.append(
        build_performance_insight(
            title=f"{confidence.capitalize()} confidence forecast",
            description=confidence_descriptions.get(confidence, ""),
            metric=confidence.upper(),
        )
    )

    # Savings estimate insight
    insights.append(
        build_financial_insight(
            title="Estimated savings ahead",
            description=f"At typical electricity rates, this production could save you ${expected_savings:.2f}.",
            metric=f"~${expected_savings:.2f}",
            benchmark=f"{days_ahead} day(s)",
        )
    )

    # Build next steps
    next_steps = []

    next_steps.append(
        build_next_step(
            action="View recent production patterns",
            reason="See the data behind this forecast",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="get_power_curve",
            params={"logger_id": logger_id},
        )
    )

    next_steps.append(
        build_next_step(
            action="Check system efficiency",
            reason="Ensure you're maximizing your production potential",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="calculate_performance_ratio",
            params={"logger_id": logger_id},
        )
    )

    next_steps.append(
        build_next_step(
            action="Calculate actual savings to date",
            reason="See how much you've saved so far",
            priority=NextStepPriority.OPTIONAL,
            tool_hint="calculate_financial_savings",
            params={"logger_id": logger_id},
        )
    )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS if confidence == "high"
        else ColorScheme.NEUTRAL if confidence == "medium"
        else ColorScheme.WARNING
    )

    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.CHART_BAR,
        display_mode=DisplayMode.STANDARD,
        highlight_metric="expectedKwh",
        color_scheme=color_scheme,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
    )
