"""Logger comparison tools.

Provides tools for comparing multiple loggers on specific metrics.
"""

from typing import Annotated

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from models.responses import ComparisonResponse
from queries.builders import build_comparison_query


def compare_loggers(
    logger_ids: Annotated[list[str], Field(description="List of logger IDs to compare (2-5)")],
    metric: Annotated[
        str, Field(description="Metric to compare: 'power', 'energy', or 'irradiance'")
    ] = "power",
    date: Annotated[str | None, Field(description="Date in YYYY-MM-DD format (optional)")] = None,
) -> dict:
    """Compare multiple loggers on a specific metric for a given date.

    Returns merged timeseries data suitable for multi-line charts.

    Args:
        logger_ids: List of logger IDs to compare (2-5)
        metric: Metric to compare ('power', 'energy', 'irradiance')
        date: Optional date filter in YYYY-MM-DD format

    Returns:
        ComparisonResponse with merged timeseries data
    """
    if len(logger_ids) < 2 or len(logger_ids) > 5:
        return {"type": "error", "message": "Provide 2-5 logger IDs for comparison"}

    query = build_comparison_query(metric, include_date_filter=date is not None)
    params: dict = {"logger_ids": logger_ids}
    if date:
        params["date"] = date

    df = pd.read_sql(query, engine, params=params)

    if df.empty:
        return ComparisonResponse(
            metric=metric,
            loggerIds=logger_ids,
            date=date,
            data=[],
            message="No data found for the specified loggers",
        ).model_dump()

    # Pivot to get each logger as a column
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    pivot = df.pivot_table(index="timestamp", columns="loggerId", values="value", aggfunc="mean")
    pivot = pivot.reset_index()

    # Downsample if too many points for performance
    if len(pivot) > settings.comparison_max_points:
        pivot = pivot.set_index("timestamp").resample(settings.resample_interval).mean().reset_index()

    # Convert to list of dicts with timestamp + each logger's value
    data = []
    for _, row in pivot.iterrows():
        point: dict = {"timestamp": row["timestamp"].isoformat()}
        for lid in logger_ids:
            if lid in pivot.columns:
                val = row.get(lid)
                point[lid] = float(val) if pd.notna(val) else None
        data.append(point)

    return ComparisonResponse(
        metric=metric,
        loggerIds=logger_ids,
        date=date,
        recordCount=len(data),
        data=data,
    ).model_dump()
