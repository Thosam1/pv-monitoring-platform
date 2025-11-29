"""
Test suite for Solar Analytics AI Service MCP tools.

Uses FastMCP Client pattern with mocked database queries.
Assertions use inline-snapshot for JSON output validation.
"""

from unittest.mock import patch
from inline_snapshot import snapshot
from fastmcp import Client


class TestListLoggers:
    """Tests for list_loggers tool."""

    async def test_returns_logger_list(self, mcp_client: Client, mock_loggers_df):
        """Should return list of loggers with metadata."""
        with patch("tools.discovery.pd.read_sql", return_value=mock_loggers_df):
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
        with patch("tools.discovery.pd.read_sql", return_value=mock_empty_df):
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
        with patch("tools.monitoring.pd.read_sql", return_value=mock_anomaly_df):
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
        with patch("tools.monitoring.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "analyze_inverter_health",
                {"logger_id": "UNKNOWN", "days": 7}
            )

        assert result.data == snapshot({
            "type": "anomaly_report",
            "loggerId": "UNKNOWN",
            "daysAnalyzed": None,
            "totalRecords": None,
            "anomalyCount": None,
            "points": [],
            "message": "No data found for the specified logger and time range",
        })

    async def test_uses_default_days_parameter(self, mcp_client: Client, mock_anomaly_df):
        """Should default to 7 days when not specified."""
        with patch("tools.monitoring.pd.read_sql", return_value=mock_anomaly_df):
            result = await mcp_client.call_tool(
                "analyze_inverter_health",
                {"logger_id": "INV001"}  # No days parameter
            )

        assert result.data["daysAnalyzed"] == 7


class TestGetPowerCurve:
    """Tests for get_power_curve tool."""

    async def test_returns_timeseries_data(self, mcp_client: Client, mock_power_curve_df):
        """Should return power and irradiance timeseries."""
        with patch("tools.monitoring.pd.read_sql", return_value=mock_power_curve_df):
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
        with patch("tools.monitoring.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "get_power_curve",
                {"logger_id": "INV001", "date": "2020-01-01"}
            )

        assert result.data == snapshot({
            "type": "timeseries",
            "loggerId": "INV001",
            "date": "2020-01-01",
            "recordCount": None,
            "data": [],
            "message": "No data found for the specified logger and date",
        })


class TestCompareLoggers:
    """Tests for compare_loggers tool."""

    async def test_compares_multiple_loggers(self, mcp_client: Client, mock_comparison_df):
        """Should return merged comparison data for multiple loggers."""
        with patch("tools.comparison.pd.read_sql", return_value=mock_comparison_df):
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
        with patch("tools.comparison.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "compare_loggers",
                {"logger_ids": ["INV001", "INV002"], "metric": "power"}
            )

        assert result.data["type"] == "comparison"
        assert result.data["data"] == []
        assert "message" in result.data


class TestCalculateFinancialSavings:
    """Tests for calculate_financial_savings tool."""

    async def test_calculates_savings(self, mcp_client: Client, mock_financial_df):
        """Should calculate financial savings from energy generation."""
        with patch("tools.financial.pd.read_sql", return_value=mock_financial_df):
            result = await mcp_client.call_tool(
                "calculate_financial_savings",
                {
                    "logger_id": "INV001",
                    "start_date": "2024-06-01",
                    "end_date": "2024-06-03",
                    "electricity_rate": 0.20
                }
            )

        data = result.data
        assert data["type"] == "financial_report"
        assert data["loggerId"] == "INV001"
        assert data["period"]["start"] == "2024-06-01"
        assert data["period"]["end"] == "2024-06-03"
        assert data["daysWithData"] == 3
        assert data["totalEnergyKwh"] == 146.5  # 45.5 + 52.3 + 48.7
        assert data["savingsUsd"] == 29.3  # 146.5 * 0.20
        assert data["co2OffsetKg"] > 0
        assert data["treesEquivalent"] > 0
        assert "summary" in data

    async def test_returns_empty_when_no_data(self, mcp_client: Client, mock_empty_df):
        """Should return message when no data found."""
        with patch("tools.financial.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "calculate_financial_savings",
                {"logger_id": "UNKNOWN", "start_date": "2024-06-01"}
            )

        assert result.data["type"] == "financial_report"
        assert "message" in result.data


class TestCalculatePerformanceRatio:
    """Tests for calculate_performance_ratio tool."""

    async def test_calculates_performance_ratio(
        self, mcp_client: Client, mock_peak_power_df, mock_performance_df
    ):
        """Should calculate performance ratio for a date."""
        with patch("tools.performance.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [mock_peak_power_df, mock_performance_df]
            result = await mcp_client.call_tool(
                "calculate_performance_ratio",
                {"logger_id": "INV001", "date": "2024-06-15"}
            )

        data = result.data
        assert data["type"] == "performance_report"
        assert data["loggerId"] == "INV001"
        assert data["date"] == "2024-06-15"
        assert data["inferredCapacityKw"] is not None
        assert data["performanceRatio"] is not None
        assert data["status"] in ["normal", "low", "critical"]
        assert data["metrics"] is not None
        assert "interpretation" in data

    async def test_returns_message_when_no_capacity(self, mcp_client: Client, mock_empty_df):
        """Should return message when capacity cannot be inferred."""
        empty_peak = mock_empty_df.copy()
        empty_peak["peakWatts"] = None
        with patch("tools.performance.pd.read_sql", return_value=empty_peak):
            result = await mcp_client.call_tool(
                "calculate_performance_ratio",
                {"logger_id": "UNKNOWN", "date": "2024-06-15"}
            )

        assert result.data["type"] == "performance_report"
        assert "message" in result.data


class TestForecastProduction:
    """Tests for forecast_production tool."""

    async def test_generates_forecast(self, mcp_client: Client, mock_forecast_df):
        """Should generate production forecast based on historical data."""
        with patch("tools.forecasting.pd.read_sql", return_value=mock_forecast_df):
            result = await mcp_client.call_tool(
                "forecast_production",
                {"logger_id": "INV001", "days_ahead": 3}
            )

        data = result.data
        assert data["type"] == "production_forecast"
        assert data["loggerId"] == "INV001"
        assert data["method"] == "historical_average"
        assert data["basedOnDays"] == 7
        assert data["historicalStats"] is not None
        assert len(data["forecasts"]) == 3
        for forecast in data["forecasts"]:
            assert "date" in forecast
            assert "expectedKwh" in forecast
            assert "rangeMin" in forecast
            assert "rangeMax" in forecast
            assert forecast["confidence"] in ["high", "medium", "low"]

    async def test_returns_message_when_insufficient_data(self, mcp_client: Client, mock_empty_df):
        """Should return message when insufficient historical data."""
        with patch("tools.forecasting.pd.read_sql", return_value=mock_empty_df):
            result = await mcp_client.call_tool(
                "forecast_production",
                {"logger_id": "UNKNOWN", "days_ahead": 1}
            )

        assert result.data["type"] == "production_forecast"
        assert "message" in result.data


class TestDiagnoseErrorCodes:
    """Tests for diagnose_error_codes tool."""

    async def test_diagnoses_errors(
        self, mcp_client: Client, mock_logger_type_df, mock_error_metadata_df
    ):
        """Should diagnose error codes from metadata."""
        with patch("tools.diagnostics.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [mock_logger_type_df, mock_error_metadata_df]
            result = await mcp_client.call_tool(
                "diagnose_error_codes",
                {"logger_id": "INV001", "days": 7}
            )

        data = result.data
        assert data["type"] == "diagnostics_report"
        assert data["loggerId"] == "INV001"
        assert data["loggerType"] == "goodwe"
        assert data["issueCount"] == 2  # E001 and E004
        assert data["overallHealth"] in ["good", "info", "warning", "critical"]
        assert len(data["issues"]) == 2

        # Verify issue structure
        for issue in data["issues"]:
            assert "code" in issue
            assert "description" in issue
            assert "severity" in issue
            assert "occurrences" in issue
            assert "suggestedFix" in issue

    async def test_returns_good_health_when_no_errors(
        self, mcp_client: Client, mock_logger_type_df, mock_empty_df
    ):
        """Should return good health when no errors found."""
        with patch("tools.diagnostics.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [mock_logger_type_df, mock_empty_df]
            result = await mcp_client.call_tool(
                "diagnose_error_codes",
                {"logger_id": "INV001", "days": 7}
            )

        assert result.data["overallHealth"] == "good"
        assert result.data["issueCount"] == 0


class TestGetFleetOverview:
    """Tests for get_fleet_overview tool."""

    async def test_returns_fleet_status(
        self, mcp_client: Client, mock_fleet_power_df, mock_fleet_energy_df, mock_fleet_count_df
    ):
        """Should return fleet overview with status and production."""
        with patch("tools.fleet.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [mock_fleet_power_df, mock_fleet_energy_df, mock_fleet_count_df]
            result = await mcp_client.call_tool("get_fleet_overview", {})

        data = result.data
        assert data["type"] == "fleet_overview"
        assert "timestamp" in data

        # Verify status
        assert data["status"]["totalLoggers"] == 6
        assert data["status"]["activeLoggers"] == 5
        assert data["status"]["percentOnline"] > 0
        assert data["status"]["fleetHealth"] in ["Healthy", "Degraded", "Critical"]

        # Verify production
        assert data["production"]["currentTotalPowerWatts"] == 25000.0
        assert data["production"]["todayTotalEnergyKwh"] == 150.5
        assert data["production"]["siteAvgIrradiance"] == 750.0

        assert "summary" in data

    async def test_handles_no_active_loggers(
        self, mcp_client: Client, mock_fleet_energy_df, mock_fleet_count_df
    ):
        """Should handle scenario with no active loggers."""
        import pandas as pd
        empty_power = pd.DataFrame({
            "activeLoggers": [0],
            "totalPowerWatts": [0.0],
            "avgIrradiance": [0.0],
        })
        with patch("tools.fleet.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [empty_power, mock_fleet_energy_df, mock_fleet_count_df]
            result = await mcp_client.call_tool("get_fleet_overview", {})

        assert result.data["status"]["activeLoggers"] == 0
        assert result.data["status"]["fleetHealth"] == "Critical"


class TestHealthCheck:
    """Tests for health_check tool."""

    async def test_returns_healthy_status(self, mcp_client: Client):
        """Should return healthy status when database is connected."""
        mock_pool_stats = {
            "status": "healthy",
            "pool_size": 5,
            "checked_in": 4,
            "checked_out": 1,
            "overflow": 0,
        }
        with patch("tools.health.check_connection", return_value=mock_pool_stats):
            result = await mcp_client.call_tool("health_check", {})

        data = result.data
        assert data["type"] == "health_check"
        assert data["status"] == "healthy"
        assert data["database"] == "healthy"
        assert data["pool_stats"]["pool_size"] == 5
        assert data["pool_stats"]["checked_in"] == 4
        assert data["pool_stats"]["checked_out"] == 1

    async def test_returns_degraded_when_db_fails(self, mcp_client: Client):
        """Should return degraded status when database connection fails."""
        mock_error = {
            "status": "unhealthy",
            "error": "Connection refused",
        }
        with patch("tools.health.check_connection", return_value=mock_error):
            result = await mcp_client.call_tool("health_check", {})

        data = result.data
        assert data["type"] == "health_check"
        assert data["status"] == "degraded"
        assert data["database"] == "Connection refused"
        assert data["pool_stats"] is None


class TestToolDiscovery:
    """Tests for MCP tool discovery."""

    async def test_all_tools_registered(self, mcp_client: Client):
        """Should expose all 10 expected tools."""
        tools = await mcp_client.list_tools()
        tool_names = {t.name for t in tools}

        assert tool_names == snapshot({
            "list_loggers",
            "analyze_inverter_health",
            "get_power_curve",
            "compare_loggers",
            "calculate_financial_savings",
            "calculate_performance_ratio",
            "forecast_production",
            "diagnose_error_codes",
            "get_fleet_overview",
            "health_check",
        })

    async def test_tools_have_descriptions(self, mcp_client: Client):
        """Each tool should have a description."""
        tools = await mcp_client.list_tools()

        for tool in tools:
            assert tool.description, f"Tool {tool.name} missing description"
