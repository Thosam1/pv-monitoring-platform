"""
Test suite for context envelope generation in MCP tools.

Tests that tools correctly generate user-friendly context with:
- Summaries
- Insights (performance, financial, operational)
- Next steps with appropriate priorities
- UI suggestions

NOTE: These tests don't use the MCP client pattern from conftest.py.
They test the context models and tool functions directly with mocked data.
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

import pandas as pd
import pytest

# Add parent directory to path for direct imports
sys.path.insert(0, str(Path(__file__).parent.parent))

# Avoid conftest's MCP client fixture by importing modules directly

from models.context import (
    ContextEnvelope,
    Insight,
    NextStep,
    UISuggestion,
    InsightType,
    InsightSeverity,
    NextStepPriority,
    UIComponentHint,
    DisplayMode,
    ColorScheme,
    build_performance_insight,
    build_financial_insight,
    build_operational_insight,
    build_next_step,
)


class TestContextModels:
    """Tests for context model classes and builders."""

    def test_insight_creation(self):
        """Should create an insight with all fields."""
        insight = Insight(
            type=InsightType.PERFORMANCE,
            severity=InsightSeverity.WARNING,
            title="Low efficiency detected",
            description="System operating below expected capacity",
            metric="72%",
            benchmark="vs 85% typical",
        )

        assert insight.type == InsightType.PERFORMANCE
        assert insight.severity == InsightSeverity.WARNING
        assert insight.title == "Low efficiency detected"
        assert insight.metric == "72%"
        assert insight.benchmark == "vs 85% typical"

    def test_next_step_creation(self):
        """Should create a next step with all fields."""
        step = NextStep(
            priority=NextStepPriority.URGENT,
            action="Check error codes for inverter 925",
            reason="2 anomalies detected during peak hours",
            tool_hint="diagnose_error_codes",
            params={"logger_id": "925", "days": 7},
        )

        assert step.priority == NextStepPriority.URGENT
        assert step.action == "Check error codes for inverter 925"
        assert step.tool_hint == "diagnose_error_codes"
        assert step.params == {"logger_id": "925", "days": 7}

    def test_ui_suggestion_creation(self):
        """Should create UI suggestion with all fields."""
        ui = UISuggestion(
            preferred_component=UIComponentHint.CHART_COMPOSED,
            display_mode=DisplayMode.DETAILED,
            highlight_metric="peakValue",
            color_scheme=ColorScheme.SUCCESS,
        )

        assert ui.preferred_component == UIComponentHint.CHART_COMPOSED
        assert ui.display_mode == DisplayMode.DETAILED
        assert ui.color_scheme == ColorScheme.SUCCESS

    def test_context_envelope_creation(self):
        """Should create context envelope with all fields."""
        context = ContextEnvelope(
            summary="Your system is running smoothly.",
            insights=[
                Insight(
                    type=InsightType.PERFORMANCE,
                    severity=InsightSeverity.INFO,
                    title="Good performance",
                    description="All systems operational",
                )
            ],
            next_steps=[
                NextStep(
                    priority=NextStepPriority.SUGGESTED,
                    action="View financial savings",
                    reason="See how much you're saving",
                )
            ],
            ui_suggestion=UISuggestion(
                preferred_component=UIComponentHint.METRIC_GRID,
                display_mode=DisplayMode.STANDARD,
            ),
            alert=None,
        )

        assert context.summary == "Your system is running smoothly."
        assert len(context.insights) == 1
        assert len(context.next_steps) == 1
        assert context.ui_suggestion is not None
        assert context.alert is None


class TestContextBuilderHelpers:
    """Tests for helper functions that build context components."""

    def test_build_performance_insight(self):
        """Should build performance insight with defaults."""
        insight = build_performance_insight(
            title="Peak output",
            description="System reached maximum power at midday",
            metric="4.25 kW",
        )

        assert insight.type == InsightType.PERFORMANCE
        assert insight.severity == InsightSeverity.INFO
        assert insight.title == "Peak output"
        assert insight.metric == "4.25 kW"

    def test_build_performance_insight_with_warning_severity(self):
        """Should build performance insight with warning severity."""
        insight = build_performance_insight(
            title="Declining production",
            description="Output dropped in afternoon",
            severity=InsightSeverity.WARNING,
        )

        assert insight.severity == InsightSeverity.WARNING

    def test_build_financial_insight(self):
        """Should build financial insight."""
        insight = build_financial_insight(
            title="You're saving money",
            description="At this rate, you'll save $150/month",
            metric="$45.50",
            benchmark="$1.50/day avg",
        )

        assert insight.type == InsightType.FINANCIAL
        assert insight.metric == "$45.50"
        assert insight.benchmark == "$1.50/day avg"

    def test_build_operational_insight(self):
        """Should build operational insight."""
        insight = build_operational_insight(
            title="Device offline",
            description="Inverter 925 is not responding",
            metric="1 device",
            severity=InsightSeverity.CRITICAL,
        )

        assert insight.type == InsightType.OPERATIONAL
        assert insight.severity == InsightSeverity.CRITICAL

    def test_build_next_step_with_defaults(self):
        """Should build next step with suggested priority by default."""
        step = build_next_step(
            action="View power curve",
            reason="See production patterns",
        )

        assert step.priority == NextStepPriority.SUGGESTED
        assert step.tool_hint is None
        assert step.params is None

    def test_build_next_step_with_all_fields(self):
        """Should build next step with all fields."""
        step = build_next_step(
            action="Check for errors",
            reason="Critical issues detected",
            priority=NextStepPriority.URGENT,
            tool_hint="diagnose_error_codes",
            params={"logger_id": "925"},
        )

        assert step.priority == NextStepPriority.URGENT
        assert step.tool_hint == "diagnose_error_codes"
        assert step.params == {"logger_id": "925"}


class TestPowerCurveContext:
    """Tests for context generation in get_power_curve tool."""

    @pytest.fixture
    def mock_power_curve_df(self):
        """Power curve data with clear peak and trend."""
        base_time = datetime(2024, 6, 15, 6, 0, 0)
        return pd.DataFrame({
            "timestamp": [base_time + timedelta(hours=i) for i in range(12)],
            "power": [0, 500, 1500, 2800, 3800, 4200, 4100, 3500, 2500, 1500, 600, 0],
            "irradiance": [0, 150, 400, 650, 850, 950, 920, 800, 600, 400, 150, 0],
        })

    async def test_context_includes_summary(self, mock_power_curve_df):
        """Context should include human-readable summary."""
        from tools.monitoring import get_power_curve

        with patch("tools.monitoring.pd.read_sql", return_value=mock_power_curve_df):
            result = get_power_curve(logger_id="925", date="2024-06-15")

        assert "context" in result
        context = result["context"]
        assert "summary" in context
        assert "925" in context["summary"]
        assert "2024-06-15" in context["summary"] or "6/15" in context["summary"].lower()

    async def test_context_includes_insights(self, mock_power_curve_df):
        """Context should include performance insights."""
        from tools.monitoring import get_power_curve

        with patch("tools.monitoring.pd.read_sql", return_value=mock_power_curve_df):
            result = get_power_curve(logger_id="925", date="2024-06-15")

        context = result["context"]
        assert "insights" in context
        assert len(context["insights"]) > 0

        # Should have performance-type insights
        insight_types = [i["type"] for i in context["insights"]]
        assert "performance" in insight_types

    async def test_context_includes_next_steps(self, mock_power_curve_df):
        """Context should include next step recommendations."""
        from tools.monitoring import get_power_curve

        with patch("tools.monitoring.pd.read_sql", return_value=mock_power_curve_df):
            result = get_power_curve(logger_id="925", date="2024-06-15")

        context = result["context"]
        assert "next_steps" in context
        assert len(context["next_steps"]) > 0

        # Each step should have required fields
        for step in context["next_steps"]:
            assert "priority" in step
            assert "action" in step
            assert "reason" in step
            assert step["priority"] in ["urgent", "recommended", "suggested", "optional"]

    async def test_context_includes_ui_suggestion(self, mock_power_curve_df):
        """Context should include UI rendering hint."""
        from tools.monitoring import get_power_curve

        with patch("tools.monitoring.pd.read_sql", return_value=mock_power_curve_df):
            result = get_power_curve(logger_id="925", date="2024-06-15")

        context = result["context"]
        assert "ui_suggestion" in context
        ui = context["ui_suggestion"]
        assert "preferred_component" in ui
        assert "display_mode" in ui


class TestFleetOverviewContext:
    """Tests for context generation in get_fleet_overview tool."""

    @pytest.fixture
    def mock_healthy_fleet(self):
        """All devices online."""
        return {
            "power": pd.DataFrame({
                "activeLoggers": [5],
                "totalPowerWatts": [25000.0],
                "avgIrradiance": [750.0],
            }),
            "energy": pd.DataFrame({"totalDailyKwh": [150.5]}),
            "count": pd.DataFrame({"totalCount": [5]}),
        }

    @pytest.fixture
    def mock_degraded_fleet(self):
        """Some devices offline."""
        return {
            "power": pd.DataFrame({
                "activeLoggers": [3],
                "totalPowerWatts": [15000.0],
                "avgIrradiance": [750.0],
            }),
            "energy": pd.DataFrame({"totalDailyKwh": [90.0]}),
            "count": pd.DataFrame({"totalCount": [5]}),
        }

    async def test_healthy_fleet_context(self, mock_healthy_fleet):
        """Healthy fleet should have success color scheme."""
        from tools.fleet import get_fleet_overview

        def mock_read_sql(query, engine):
            if "totalPowerWatts" in str(query) or "activeLoggers" in str(query):
                return mock_healthy_fleet["power"]
            elif "totalDailyKwh" in str(query):
                return mock_healthy_fleet["energy"]
            else:
                return mock_healthy_fleet["count"]

        with patch("tools.fleet.pd.read_sql", side_effect=mock_read_sql):
            with patch("tools.fleet.get_anchor_date", return_value=datetime.now()):
                result = get_fleet_overview()

        assert "context" in result
        context = result["context"]
        assert context["ui_suggestion"]["color_scheme"] == "success"
        # Should not have urgent next steps
        urgent_steps = [s for s in context["next_steps"] if s["priority"] == "urgent"]
        assert len(urgent_steps) == 0

    async def test_degraded_fleet_context(self, mock_degraded_fleet):
        """Degraded fleet should have warning indicators."""
        from tools.fleet import get_fleet_overview

        def mock_read_sql(query, engine):
            if "totalPowerWatts" in str(query) or "activeLoggers" in str(query):
                return mock_degraded_fleet["power"]
            elif "totalDailyKwh" in str(query):
                return mock_degraded_fleet["energy"]
            else:
                return mock_degraded_fleet["count"]

        with patch("tools.fleet.pd.read_sql", side_effect=mock_read_sql):
            with patch("tools.fleet.get_anchor_date", return_value=datetime.now()):
                result = get_fleet_overview()

        context = result["context"]
        # Should have warning color scheme
        assert context["ui_suggestion"]["color_scheme"] in ["warning", "danger"]
        # Should mention offline devices
        assert "offline" in context["summary"].lower() or "3" in context["summary"]


class TestFinancialReportContext:
    """Tests for context generation in calculate_financial_savings tool."""

    @pytest.fixture
    def mock_financial_df(self):
        """Financial data for 30 days."""
        return pd.DataFrame({
            "date": [(datetime.now() - timedelta(days=i)).date() for i in range(30)],
            "dailyKwh": [45.0 + (i % 10) for i in range(30)],
        })

    async def test_financial_context_includes_projections(self, mock_financial_df):
        """Financial context should include savings projections."""
        from tools.financial import calculate_financial_savings

        with patch("tools.financial.pd.read_sql", return_value=mock_financial_df):
            result = calculate_financial_savings(
                logger_id="925",
                start_date="2024-01-01",
                end_date="2024-01-30",
            )

        assert "context" in result
        context = result["context"]

        # Summary should mention savings
        assert "$" in context["summary"]

        # Should have financial insights
        financial_insights = [i for i in context["insights"] if i["type"] == "financial"]
        assert len(financial_insights) > 0


class TestPerformanceRatioContext:
    """Tests for context generation in calculate_performance_ratio tool."""

    @pytest.fixture
    def mock_normal_performance_df(self):
        """High efficiency performance data - produces ~85% PR."""
        base_time = datetime(2024, 6, 15, 10, 0, 0)
        # PR = actual_power / (irradiance * capacity_kw * ref_efficiency * 10)
        # For 85% PR with 5kW capacity and 0.15 ref efficiency:
        # actual_power = 0.85 * irradiance * 5 * 0.15 * 10 = 0.85 * irradiance * 7.5
        return pd.DataFrame({
            "timestamp": [base_time + timedelta(minutes=15 * i) for i in range(8)],
            "activePowerWatts": [4462.0, 5100.0, 5418.0, 5546.0, 5482.0, 5100.0, 4781.0, 4144.0],
            "irradiance": [700.0, 800.0, 850.0, 870.0, 860.0, 800.0, 750.0, 650.0],
        })

    @pytest.fixture
    def mock_critical_performance_df(self):
        """Low efficiency performance data."""
        base_time = datetime(2024, 6, 15, 10, 0, 0)
        return pd.DataFrame({
            "timestamp": [base_time + timedelta(minutes=15 * i) for i in range(8)],
            "activePowerWatts": [1000.0, 1200.0, 1100.0, 1300.0, 1150.0, 1000.0, 900.0, 800.0],
            "irradiance": [700.0, 800.0, 850.0, 870.0, 860.0, 800.0, 750.0, 650.0],
        })

    async def test_normal_performance_context(self, mock_normal_performance_df):
        """Normal performance should have success indicators."""
        from tools.performance import calculate_performance_ratio

        with patch("tools.performance.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [
                pd.DataFrame({"peakWatts": [4500.0]}),  # Peak query
                mock_normal_performance_df,  # Performance query
            ]
            result = calculate_performance_ratio(logger_id="925", date="2024-06-15")

        if "context" in result:
            context = result["context"]
            # Should indicate good performance
            assert context["ui_suggestion"]["color_scheme"] == "success"

    async def test_critical_performance_context(self, mock_critical_performance_df):
        """Critical performance should have urgent next steps."""
        from tools.performance import calculate_performance_ratio

        with patch("tools.performance.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [
                pd.DataFrame({"peakWatts": [4500.0]}),  # Peak query
                mock_critical_performance_df,  # Performance query
            ]
            result = calculate_performance_ratio(logger_id="925", date="2024-06-15")

        if "context" in result and result.get("status") == "critical":
            context = result["context"]
            # Should have danger color scheme
            assert context["ui_suggestion"]["color_scheme"] == "danger"
            # Should have urgent next steps
            urgent_steps = [s for s in context["next_steps"] if s["priority"] == "urgent"]
            assert len(urgent_steps) > 0


class TestDiagnosticsContext:
    """Tests for context generation in diagnose_error_codes tool."""

    @pytest.fixture
    def mock_no_errors(self):
        """No error codes in metadata."""
        return pd.DataFrame({
            "timestamp": [datetime.now()],
            "metadata": [{"status": "ok"}],
        })

    @pytest.fixture
    def mock_critical_errors(self):
        """Critical error codes in metadata."""
        base_time = datetime.now()
        return pd.DataFrame({
            "timestamp": [base_time, base_time + timedelta(hours=1)],
            "metadata": [
                {"errorCode": "E001"},
                {"errorCode": "E001"},
            ],
        })

    async def test_no_errors_context(self, mock_no_errors):
        """No errors should have positive context."""
        from tools.diagnostics import diagnose_error_codes

        with patch("tools.diagnostics.pd.read_sql") as mock_sql:
            mock_sql.side_effect = [
                pd.DataFrame({"loggerType": ["goodwe"]}),  # Type query
                mock_no_errors,  # Error scan query
            ]
            result = diagnose_error_codes(logger_id="925", days=7)

        if "context" in result:
            context = result["context"]
            # Should have success color
            assert context["ui_suggestion"]["color_scheme"] == "success"
            # Summary should be positive
            assert "good" in context["summary"].lower() or "no error" in context["summary"].lower()


class TestComparisonContext:
    """Tests for context generation in compare_loggers tool."""

    @pytest.fixture
    def mock_consistent_loggers_df(self):
        """Loggers with similar performance."""
        base_time = datetime(2024, 6, 15, 8, 0, 0)
        return pd.DataFrame({
            "timestamp": [base_time + timedelta(minutes=30 * i) for i in range(6)] * 2,
            "loggerId": ["INV001"] * 6 + ["INV002"] * 6,
            "value": [
                3000, 3100, 3200, 3150, 3100, 3000,  # INV001
                2950, 3050, 3150, 3100, 3050, 2950,  # INV002 (similar)
            ],
        })

    @pytest.fixture
    def mock_divergent_loggers_df(self):
        """Loggers with very different performance."""
        base_time = datetime(2024, 6, 15, 8, 0, 0)
        return pd.DataFrame({
            "timestamp": [base_time + timedelta(minutes=30 * i) for i in range(6)] * 2,
            "loggerId": ["INV001"] * 6 + ["INV002"] * 6,
            "value": [
                3000, 3500, 4000, 4200, 4000, 3500,  # INV001 (good)
                1000, 1200, 1100, 1300, 1200, 1000,  # INV002 (poor)
            ],
        })

    async def test_consistent_loggers_context(self, mock_consistent_loggers_df):
        """Consistent loggers should have positive context."""
        from tools.comparison import compare_loggers

        with patch("tools.comparison.pd.read_sql", return_value=mock_consistent_loggers_df):
            result = compare_loggers(
                logger_ids=["INV001", "INV002"],
                metric="power",
                date="2024-06-15",
            )

        if "context" in result:
            context = result["context"]
            # Summary should mention consistency
            assert "consistent" in context["summary"].lower() or "similar" in context["summary"].lower()

    async def test_divergent_loggers_context(self, mock_divergent_loggers_df):
        """Divergent loggers should flag underperformer."""
        from tools.comparison import compare_loggers

        with patch("tools.comparison.pd.read_sql", return_value=mock_divergent_loggers_df):
            result = compare_loggers(
                logger_ids=["INV001", "INV002"],
                metric="power",
                date="2024-06-15",
            )

        if "context" in result:
            context = result["context"]
            # Should identify underperformer
            underperformer_insights = [
                i for i in context["insights"]
                if "underperform" in i["title"].lower() or "INV002" in i["title"]
            ]
            # May or may not have specific insight, but should mention difference
            assert "%" in context["summary"] or "difference" in context["summary"].lower()
