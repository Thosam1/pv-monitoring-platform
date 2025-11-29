"""Input validation models for MCP tool parameters.

Provides reusable validation for common parameter types across tools.
"""

from pydantic import BaseModel, field_validator
from datetime import date


class DateParam(BaseModel):
    """Validates a date string in YYYY-MM-DD format."""

    date: str

    @field_validator("date")
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        """Ensure date is in ISO format (YYYY-MM-DD)."""
        try:
            date.fromisoformat(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD")


class LoggerIdParam(BaseModel):
    """Validates a logger ID."""

    logger_id: str

    @field_validator("logger_id")
    @classmethod
    def validate_logger_id(cls, v: str) -> str:
        """Ensure logger ID is not empty and has minimum length."""
        if not v or len(v.strip()) < 1:
            raise ValueError("Logger ID cannot be empty")
        return v.strip()


class CompareLoggersParams(BaseModel):
    """Validates logger comparison parameters."""

    logger_ids: list[str]

    @field_validator("logger_ids")
    @classmethod
    def validate_logger_count(cls, v: list[str]) -> list[str]:
        """Ensure 2-5 logger IDs are provided for comparison."""
        if len(v) < 2:
            raise ValueError("Must provide at least 2 logger IDs for comparison")
        if len(v) > 5:
            raise ValueError("Cannot compare more than 5 loggers at once")
        return v


class DateRangeParams(BaseModel):
    """Validates a date range (start and optional end)."""

    start_date: str
    end_date: str | None = None

    @field_validator("start_date", "end_date")
    @classmethod
    def validate_date_format(cls, v: str | None) -> str | None:
        """Ensure dates are in ISO format (YYYY-MM-DD)."""
        if v is None:
            return None
        try:
            date.fromisoformat(v)
            return v
        except ValueError:
            raise ValueError(f"Invalid date format: {v}. Use YYYY-MM-DD")


def validate_date(date_str: str) -> str:
    """Standalone date validation function for tool parameters.

    Args:
        date_str: Date string to validate

    Returns:
        Validated date string

    Raises:
        ValueError: If date format is invalid
    """
    try:
        date.fromisoformat(date_str)
        return date_str
    except ValueError:
        raise ValueError(f"Invalid date format: {date_str}. Use YYYY-MM-DD")


def validate_metric(metric: str) -> str:
    """Validate metric name for comparison tool.

    Args:
        metric: Metric name to validate

    Returns:
        Validated metric name

    Raises:
        ValueError: If metric is not valid
    """
    valid_metrics = {"power", "energy", "irradiance"}
    if metric not in valid_metrics:
        raise ValueError(f"Invalid metric: {metric}. Must be one of: {', '.join(valid_metrics)}")
    return metric
