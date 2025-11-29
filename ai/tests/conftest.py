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

import pandas as pd  # noqa: E402
import pytest  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402
from fastmcp import Client  # noqa: E402

# Add parent directory to path so we can import server
sys.path.insert(0, str(Path(__file__).parent.parent))

from server import mcp  # noqa: E402


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


@pytest.fixture
def mock_financial_df():
    """Sample DataFrame for calculate_financial_savings tool."""
    return pd.DataFrame({
        "date": [
            datetime(2024, 6, 1).date(),
            datetime(2024, 6, 2).date(),
            datetime(2024, 6, 3).date(),
        ],
        "dailyKwh": [45.5, 52.3, 48.7],
    })


@pytest.fixture
def mock_peak_power_df():
    """Sample DataFrame for peak power query in performance tool."""
    return pd.DataFrame({"peakWatts": [4500.0]})


@pytest.fixture
def mock_performance_df():
    """Sample DataFrame for calculate_performance_ratio tool."""
    base_time = datetime(2024, 6, 15, 10, 0, 0)
    return pd.DataFrame({
        "timestamp": [base_time + timedelta(minutes=15*i) for i in range(8)],
        "activePowerWatts": [3000.0, 3500.0, 4000.0, 4200.0, 4100.0, 3800.0, 3200.0, 2500.0],
        "irradiance": [600.0, 700.0, 800.0, 850.0, 830.0, 780.0, 650.0, 500.0],
    })


@pytest.fixture
def mock_forecast_df():
    """Sample DataFrame for forecast_production tool."""
    return pd.DataFrame({
        "date": [
            (datetime.now() - timedelta(days=i)).date()
            for i in range(1, 8)
        ],
        "dailyKwh": [45.0, 48.0, 42.0, 50.0, 47.0, 44.0, 46.0],
    })


@pytest.fixture
def mock_logger_type_df():
    """Sample DataFrame for logger type query."""
    return pd.DataFrame({"loggerType": ["goodwe"]})


@pytest.fixture
def mock_error_metadata_df():
    """Sample DataFrame with error codes in metadata."""
    base_time = datetime(2024, 6, 15, 10, 0, 0)
    return pd.DataFrame({
        "timestamp": [
            base_time,
            base_time + timedelta(hours=1),
            base_time + timedelta(hours=2),
        ],
        "metadata": [
            {"errorCode": "E001", "message": "Grid voltage issue"},
            {"errorCode": "E001", "message": "Grid voltage issue"},
            {"errorCode": "E004", "message": "Overtemperature"},
        ],
    })


@pytest.fixture
def mock_fleet_power_df():
    """Sample DataFrame for fleet power query."""
    return pd.DataFrame({
        "activeLoggers": [5],
        "totalPowerWatts": [25000.0],
        "avgIrradiance": [750.0],
    })


@pytest.fixture
def mock_fleet_energy_df():
    """Sample DataFrame for fleet energy query."""
    return pd.DataFrame({"totalDailyKwh": [150.5]})


@pytest.fixture
def mock_fleet_count_df():
    """Sample DataFrame for fleet count query."""
    return pd.DataFrame({"totalCount": [6]})
