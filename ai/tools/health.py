"""Health check tool for service monitoring.

Provides a health check endpoint to verify service and database connectivity.
"""

from database import check_connection
from models.responses import HealthCheckResponse, DatabasePoolStats


def health_check() -> dict:
    """Check service health and database connectivity.

    Verifies database connection and returns pool statistics.
    Use this tool to monitor service health and diagnose connectivity issues.

    Returns:
        HealthCheckResponse with status and pool stats
    """
    db_status = check_connection()

    if db_status["status"] == "healthy":
        return HealthCheckResponse(
            status="healthy",
            database="healthy",
            pool_stats=DatabasePoolStats(
                pool_size=db_status["pool_size"],
                checked_in=db_status["checked_in"],
                checked_out=db_status["checked_out"],
                overflow=db_status["overflow"],
            ),
        ).model_dump()

    return HealthCheckResponse(
        status="degraded",
        database=db_status.get("error", "unknown error"),
    ).model_dump()
