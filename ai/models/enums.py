"""
Shared enumerations for AI service responses.
Single source of truth for status values to prevent spelling bugs.
"""

from enum import Enum


class DataStatus(str, Enum):
    """Status codes for tool responses indicating data availability."""

    OK = "ok"  # Data retrieved successfully
    NO_DATA = "no_data"  # Logger has no data at all
    NO_DATA_IN_WINDOW = "no_data_in_window"  # Data exists, but not for requested date
