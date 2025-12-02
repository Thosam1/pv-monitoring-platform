"""Database connection module for the Solar Analytics AI Service.

Uses SQLAlchemy to connect to PostgreSQL with READ-ONLY operations.
CRITICAL: Column names must match TypeORM entity exactly (camelCase with quotes).
"""

from datetime import datetime, timezone
from typing import Any

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError, InterfaceError
from sqlalchemy.orm import sessionmaker
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from config import settings
from logging_config import get_logger

logger = get_logger(__name__)

# Cache for anchor date (refreshed periodically)
_anchor_date_cache: datetime | None = None

# Create engine with connection pooling using settings
engine = create_engine(
    settings.database_url,
    echo=False,
    pool_size=settings.db_pool_size,
    max_overflow=settings.db_max_overflow,
    pool_pre_ping=settings.db_pool_pre_ping,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency injection helper for database sessions.

    Ensures connections are properly closed after use.

    Yields:
        Database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((OperationalError, InterfaceError)),
    before_sleep=lambda retry_state: logger.warning(
        "database.retry",
        attempt=retry_state.attempt_number,
        error=str(retry_state.outcome.exception()) if retry_state.outcome else None,
    ),
)
def execute_query(query: str, params: dict[str, Any] | None = None) -> pd.DataFrame:
    """Execute a SQL query with automatic retry on transient failures.

    Retries up to 3 times with exponential backoff (1s, 2s, 4s) on:
    - OperationalError (connection issues)
    - InterfaceError (connection pool issues)

    Args:
        query: SQL query string
        params: Query parameters

    Returns:
        DataFrame with query results
    """
    logger.debug("database.query.start", query_length=len(query))
    result = pd.read_sql(query, engine, params=params)
    logger.debug("database.query.complete", rows=len(result))
    return result


def check_connection() -> dict[str, Any]:
    """Check database connectivity and return pool statistics.

    Returns:
        Dictionary with connection status and pool stats
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "pool_size": engine.pool.size(),
            "checked_in": engine.pool.checkedin(),
            "checked_out": engine.pool.checkedout(),
            "overflow": engine.pool.overflow(),
        }
    except Exception as e:
        logger.error("database.health_check.failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e),
        }


def get_anchor_date() -> datetime:
    """Get the latest timestamp in the database as the 'anchor date'.

    This is used instead of NOW() to make the system time-agnostic.
    All relative date calculations (e.g., 'last 7 days') are computed
    from this anchor date, not the current wall-clock time.

    This allows demo data from any time period to work correctly.

    Returns:
        The latest timestamp in the measurements table, or current time if no data
    """
    global _anchor_date_cache

    # Return cached value if available (cache is reset on module reload)
    if _anchor_date_cache is not None:
        return _anchor_date_cache

    try:
        with engine.connect() as conn:
            result = conn.execute(
                text('SELECT MAX("timestamp") as anchor FROM measurements')
            )
            row = result.fetchone()
            if row and row[0]:
                _anchor_date_cache = row[0]
                logger.info("database.anchor_date.set", anchor=_anchor_date_cache.isoformat())
                return _anchor_date_cache
    except Exception as e:
        logger.warning("database.anchor_date.failed", error=str(e))

    # Fallback to current time if no data
    return datetime.now(timezone.utc)


def get_anchor_date_str() -> str:
    """Get the anchor date as a YYYY-MM-DD string.

    Returns:
        Date string suitable for SQL queries
    """
    return get_anchor_date().strftime("%Y-%m-%d")


def clear_anchor_cache() -> None:
    """Clear the anchor date cache (useful after seeding new data)."""
    global _anchor_date_cache
    _anchor_date_cache = None
    logger.info("database.anchor_date.cache_cleared")
