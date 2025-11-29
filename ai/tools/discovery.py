"""Logger discovery tools.

Provides tools for discovering available loggers/inverters in the system.
"""

import pandas as pd

from database import engine
from models.responses import LoggerListResponse, LoggerInfo
from queries.builders import build_logger_list_query


def list_loggers() -> dict:
    """List all available loggers/inverters in the system.

    Returns logger IDs, types, and data date ranges.
    Use this to discover valid logger IDs before calling other tools.

    Returns:
        LoggerListResponse with count and logger details
    """
    query = build_logger_list_query()
    df = pd.read_sql(query, engine)

    if df.empty:
        return LoggerListResponse(count=0, loggers=[]).model_dump()

    loggers = [
        LoggerInfo(
            loggerId=row["loggerId"],
            loggerType=row["loggerType"],
            earliestData=(
                row["earliestData"].isoformat() if pd.notna(row["earliestData"]) else None
            ),
            latestData=row["latestData"].isoformat() if pd.notna(row["latestData"]) else None,
            recordCount=int(row["recordCount"]),
        )
        for _, row in df.iterrows()
    ]

    return LoggerListResponse(count=len(loggers), loggers=loggers).model_dump()
