"""Production forecasting tools.

Provides tools for forecasting future energy production.
"""

from typing import Annotated
from datetime import datetime, timedelta

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
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

    # Generate forecasts
    forecasts = []
    base_date = datetime.now()
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

    return ProductionForecastResponse(
        loggerId=logger_id,
        method="historical_average",
        basedOnDays=len(df),
        historicalStats=historical_stats,
        forecasts=forecasts,
        summary=f"Expected ~{avg_daily:.1f} kWh/day based on last {len(df)} days ({confidence} confidence)",
    ).model_dump()
