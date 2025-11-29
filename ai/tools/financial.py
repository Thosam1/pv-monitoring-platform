"""Financial savings calculation tools.

Provides tools for calculating money saved and CO2 offset from solar generation.
"""

from typing import Annotated
from datetime import datetime

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
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
        end_date: Optional end date (defaults to today)
        electricity_rate: Electricity rate in $/kWh

    Returns:
        FinancialReportResponse with savings calculations
    """
    # Default end_date to today
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

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
    ).model_dump()
