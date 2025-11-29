"""
Test suite for Solar Analytics AI Service MCP tools.

Uses FastMCP Client pattern with mocked database queries.
Assertions use inline-snapshot for JSON output validation.
"""

import pytest
from unittest.mock import patch
from inline_snapshot import snapshot
from fastmcp import Client


class TestListLoggers:
    """Tests for list_loggers tool."""

    async def test_returns_logger_list(self, mcp_client: Client, mock_loggers_df):
        """Should return list of loggers with metadata."""
        with patch("server.pd.read_sql", return_value=mock_loggers_df):
            result = await mcp_client.call_tool("list_loggers", {})

        assert result.data == snapshot({
            "type": "logger_list",
            "count": 3,
            "loggers": [
                {
                    "loggerId": "INV001",
                    "loggerType": "goodwe",
                    "earliestData": "2024-01-01T00:00:00",
                    "latestData": "2024-06-30T23:59:00",
                    "recordCount": 10000,
                },
                {
                    "loggerId": "INV002",
                    "loggerType": "lti",
                    "earliestData": "2024-01-15T00:00:00",
                    "latestData": "2024-06-30T23:59:00",
                    "recordCount": 8500,
                },
                {
                    "loggerId": "METEO01",
                    "loggerType": "mbmet",
                    "earliestData": "2024-02-01T00:00:00",
                    "latestData": "2024-06-30T23:59:00",
                    "recordCount": 12000,
                },
            ],
        })

    async def test_returns_empty_list_when_no_data(self, mcp_client: Client, mock_empty_df):
        """Should return empty list when no loggers exist."""
        with patch("server.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool("list_loggers", {})

        assert result.data == snapshot({
            "type": "logger_list",
            "count": 0,
            "loggers": [],
        })


class TestAnalyzeInverterHealth:
    """Tests for analyze_inverter_health tool."""

    async def test_detects_daytime_outages(self, mcp_client: Client, mock_anomaly_df):
        """Should detect power=0 when irradiance>50 as anomalies."""
        with patch("server.pd.read_sql", return_value=mock_anomaly_df):
            result = await mcp_client.call_tool(
                "analyze_inverter_health",
                {"logger_id": "INV001", "days": 7}
            )

        data = result.data
        assert data["type"] == "anomaly_report"
        assert data["loggerId"] == "INV001"
        assert data["daysAnalyzed"] == 7
        assert data["totalRecords"] == 5
        assert data["anomalyCount"] == 2
        assert len(data["points"]) == 2
        # All anomaly points should have reason "daytime_outage"
        for point in data["points"]:
            assert point["reason"] == "daytime_outage"
            assert point["activePowerWatts"] == 0 or point["activePowerWatts"] is None

    async def test_returns_empty_when_no_data(self, mcp_client: Client, mock_empty_df):
        """Should return empty report when no data found."""
        with patch("server.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "analyze_inverter_health",
                {"logger_id": "UNKNOWN", "days": 7}
            )

        assert result.data == snapshot({
            "type": "anomaly_report",
            "loggerId": "UNKNOWN",
            "points": [],
            "message": "No data found for the specified logger and time range",
        })

    async def test_uses_default_days_parameter(self, mcp_client: Client, mock_anomaly_df):
        """Should default to 7 days when not specified."""
        with patch("server.pd.read_sql", return_value=mock_anomaly_df):
            result = await mcp_client.call_tool(
                "analyze_inverter_health",
                {"logger_id": "INV001"}  # No days parameter
            )

        assert result.data["daysAnalyzed"] == 7


class TestGetPowerCurve:
    """Tests for get_power_curve tool."""

    async def test_returns_timeseries_data(self, mcp_client: Client, mock_power_curve_df):
        """Should return power and irradiance timeseries."""
        with patch("server.pd.read_sql", return_value=mock_power_curve_df):
            result = await mcp_client.call_tool(
                "get_power_curve",
                {"logger_id": "INV001", "date": "2024-06-15"}
            )

        data = result.data
        assert data["type"] == "timeseries"
        assert data["loggerId"] == "INV001"
        assert data["date"] == "2024-06-15"
        assert data["recordCount"] == 10
        assert len(data["data"]) == 10

        # Verify data structure
        first_point = data["data"][0]
        assert "timestamp" in first_point
        assert "power" in first_point
        assert "irradiance" in first_point

    async def test_returns_empty_when_no_data(self, mcp_client: Client, mock_empty_df):
        """Should return empty data array when no data found."""
        with patch("server.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "get_power_curve",
                {"logger_id": "INV001", "date": "2020-01-01"}
            )

        assert result.data == snapshot({
            "type": "timeseries",
            "loggerId": "INV001",
            "date": "2020-01-01",
            "data": [],
            "message": "No data found for the specified logger and date",
        })


class TestCompareLoggers:
    """Tests for compare_loggers tool."""

    async def test_compares_multiple_loggers(self, mcp_client: Client, mock_comparison_df):
        """Should return merged comparison data for multiple loggers."""
        with patch("server.pd.read_sql", return_value=mock_comparison_df):
            result = await mcp_client.call_tool(
                "compare_loggers",
                {
                    "logger_ids": ["INV001", "INV002"],
                    "metric": "power",
                    "date": "2024-06-15"
                }
            )

        data = result.data
        assert data["type"] == "comparison"
        assert data["metric"] == "power"
        assert data["loggerIds"] == ["INV001", "INV002"]
        assert data["date"] == "2024-06-15"
        assert data["recordCount"] == 6

        # Each data point should have timestamp + values for each logger
        for point in data["data"]:
            assert "timestamp" in point
            assert "INV001" in point or "INV002" in point

    async def test_rejects_less_than_two_loggers(self, mcp_client: Client):
        """Should return error for less than 2 logger IDs."""
        result = await mcp_client.call_tool(
            "compare_loggers",
            {"logger_ids": ["INV001"], "metric": "power"}
        )

        assert result.data == snapshot({
            "type": "error",
            "message": "Provide 2-5 logger IDs for comparison",
        })

    async def test_rejects_more_than_five_loggers(self, mcp_client: Client):
        """Should return error for more than 5 logger IDs."""
        result = await mcp_client.call_tool(
            "compare_loggers",
            {
                "logger_ids": ["INV001", "INV002", "INV003", "INV004", "INV005", "INV006"],
                "metric": "power"
            }
        )

        assert result.data == snapshot({
            "type": "error",
            "message": "Provide 2-5 logger IDs for comparison",
        })

    async def test_returns_empty_when_no_data(self, mcp_client: Client, mock_empty_df):
        """Should return empty data when no matching records found."""
        with patch("server.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "compare_loggers",
                {"logger_ids": ["INV001", "INV002"], "metric": "power"}
            )

        assert result.data["type"] == "comparison"
        assert result.data["data"] == []
        assert "message" in result.data


class TestToolDiscovery:
    """Tests for MCP tool discovery."""

    async def test_all_tools_registered(self, mcp_client: Client):
        """Should expose all 4 expected tools."""
        tools = await mcp_client.list_tools()
        tool_names = {t.name for t in tools}

        assert tool_names == snapshot({
            "list_loggers",
            "analyze_inverter_health",
            "get_power_curve",
            "compare_loggers",
        })

    async def test_tools_have_descriptions(self, mcp_client: Client):
        """Each tool should have a description."""
        tools = await mcp_client.list_tools()

        for tool in tools:
            assert tool.description, f"Tool {tool.name} missing description"
