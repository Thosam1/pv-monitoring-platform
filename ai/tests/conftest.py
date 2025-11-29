"""
Shared test fixtures for Solar Analytics AI Service.

Uses FastMCP Client pattern for in-memory testing.
Mocks database queries with pandas DataFrames.
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock

# Mock the problematic disk store import before fastmcp loads it
# This is needed due to sqlite3 compatibility issues on some systems
sys.modules['key_value.aio.stores.disk'] = MagicMock()
sys.modules['key_value.aio.stores.disk.multi_store'] = MagicMock()

import pandas as pd
import pytest
from datetime import datetime, timedelta
from fastmcp import Client

# Add parent directory to path so we can import server
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import mcp


@pytest.fixture
async def mcp_client():
    """
    FastMCP Client fixture for testing tools.
    Uses in-memory transport (no network/SSE).
    """
    async with Client(mcp) as client:
        yield client


@pytest.fixture
def mock_empty_df():
    """Empty DataFrame for no-data scenarios."""
    return pd.DataFrame()


@pytest.fixture
def mock_loggers_df():
    """Sample DataFrame for list_loggers tool."""
    return pd.DataFrame({
        "loggerId": ["INV001", "INV002", "METEO01"],
        "loggerType": ["goodwe", "lti", "mbmet"],
        "earliestData": [
            datetime(2024, 1, 1, 0, 0, 0),
            datetime(2024, 1, 15, 0, 0, 0),
            datetime(2024, 2, 1, 0, 0, 0),
        ],
        "latestData": [
            datetime(2024, 6, 30, 23, 59, 0),
            datetime(2024, 6, 30, 23, 59, 0),
            datetime(2024, 6, 30, 23, 59, 0),
        ],
        "recordCount": [10000, 8500, 12000],
    })


@pytest.fixture
def mock_power_curve_df():
    """Sample DataFrame for get_power_curve tool."""
    base_time = datetime(2024, 6, 15, 6, 0, 0)
    return pd.DataFrame({
        "timestamp": [base_time + timedelta(minutes=15*i) for i in range(10)],
        "power": [0, 500, 1200, 2500, 3800, 4200, 3900, 2800, 1500, 400],
        "irradiance": [0, 150, 350, 600, 850, 950, 900, 700, 450, 150],
    })


@pytest.fixture
def mock_anomaly_df():
    """Sample DataFrame with anomalies for analyze_inverter_health."""
    base_time = datetime(2024, 6, 15, 10, 0, 0)
    return pd.DataFrame({
        "timestamp": [base_time + timedelta(hours=i) for i in range(5)],
        "loggerId": ["INV001"] * 5,
        "activePowerWatts": [3500, 0, 3800, 0, 3600],  # 2 anomalies
        "irradiance": [800, 750, 820, 700, 780],       # All > 50
    })


@pytest.fixture
def mock_comparison_df():
    """Sample DataFrame for compare_loggers tool."""
    base_time = datetime(2024, 6, 15, 8, 0, 0)
    return pd.DataFrame({
        "timestamp": [base_time + timedelta(minutes=30*i) for i in range(6)] * 2,
        "loggerId": ["INV001"] * 6 + ["INV002"] * 6,
        "value": [1000, 2000, 3000, 3500, 3200, 2500,
                  900, 1800, 2800, 3300, 3000, 2300],
    })
