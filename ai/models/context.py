"""Enhanced context models for user-friendly MCP responses.

Provides structured summaries, insights, and next steps for non-technical users.
These models wrap raw tool results with user-friendly context that the LLM
can use to generate conversational, action-oriented responses.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class InsightType(str, Enum):
    """Types of domain insights for categorization."""

    PERFORMANCE = "performance"
    FINANCIAL = "financial"
    OPERATIONAL = "operational"
    MAINTENANCE = "maintenance"
    WEATHER = "weather"


class InsightSeverity(str, Enum):
    """Severity levels for insights."""

    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Insight(BaseModel):
    """A single domain-specific observation.

    Insights help the LLM explain data patterns in user-friendly terms.
    """

    type: InsightType = Field(description="Category of the insight")
    severity: InsightSeverity = Field(description="How important this insight is")
    title: str = Field(description="Short headline, e.g., 'Low efficiency detected'")
    description: str = Field(description="Human-readable explanation of the insight")
    metric: Optional[str] = Field(
        default=None, description="Key metric value, e.g., '72%'"
    )
    benchmark: Optional[str] = Field(
        default=None, description="Comparison benchmark, e.g., 'vs 85% typical'"
    )


class NextStepPriority(str, Enum):
    """Priority levels for recommended actions."""

    URGENT = "urgent"  # Requires immediate attention (red badge)
    RECOMMENDED = "recommended"  # Should do soon (amber badge)
    SUGGESTED = "suggested"  # Nice to have (blue badge)
    OPTIONAL = "optional"  # For exploration (no badge)


class NextStep(BaseModel):
    """A recommended follow-up action.

    Next steps guide users toward valuable actions based on the current analysis.
    """

    priority: NextStepPriority = Field(description="How urgent this action is")
    action: str = Field(
        description="Natural language action, e.g., 'Check error codes for inverter 925'"
    )
    reason: str = Field(
        description="Why this is recommended, e.g., '2 anomalies detected during peak hours'"
    )
    tool_hint: Optional[str] = Field(
        default=None, description="Tool to invoke, e.g., 'diagnose_error_codes'"
    )
    params: Optional[dict] = Field(
        default=None, description="Pre-filled parameters for the suggested tool"
    )


class UIComponentHint(str, Enum):
    """Suggested UI components for rendering.

    These are hints, not requirements - the frontend can override.
    """

    CHART_LINE = "chart_line"
    CHART_BAR = "chart_bar"
    CHART_COMPOSED = "chart_composed"
    CHART_PIE = "chart_pie"
    METRIC_CARD = "metric_card"
    METRIC_GRID = "metric_grid"
    STATUS_BADGE = "status_badge"
    ALERT_BANNER = "alert_banner"
    DATA_TABLE = "data_table"


class DisplayMode(str, Enum):
    """Display modes for UI rendering."""

    COMPACT = "compact"
    STANDARD = "standard"
    DETAILED = "detailed"
    SUMMARY = "summary"


class ColorScheme(str, Enum):
    """Color schemes for visual feedback."""

    SUCCESS = "success"  # Green - good performance
    WARNING = "warning"  # Amber - needs attention
    DANGER = "danger"  # Red - critical issue
    NEUTRAL = "neutral"  # Gray - informational


class UISuggestion(BaseModel):
    """Hint for UI rendering (non-prescriptive).

    Tools can suggest how their data should be displayed, but the
    frontend and LLM can override based on context.
    """

    preferred_component: UIComponentHint = Field(
        description="Suggested component type for rendering"
    )
    display_mode: DisplayMode = Field(
        default=DisplayMode.STANDARD, description="How detailed the display should be"
    )
    highlight_metric: Optional[str] = Field(
        default=None, description="Key metric to emphasize in the UI"
    )
    color_scheme: Optional[ColorScheme] = Field(
        default=None, description="Visual color scheme based on status"
    )


class ContextEnvelope(BaseModel):
    """Enhanced context envelope for all tool responses.

    This wraps the raw tool result with user-friendly context that helps
    the LLM generate conversational, non-technical responses.

    Example:
        context = ContextEnvelope(
            summary="Your inverter produced 25.2 kWh today, peaking at 4.25 kW at midday.",
            insights=[
                Insight(
                    type=InsightType.PERFORMANCE,
                    severity=InsightSeverity.INFO,
                    title="Strong midday performance",
                    description="Peak production at 12:30 indicates good solar exposure.",
                    metric="4.25 kW"
                )
            ],
            next_steps=[
                NextStep(
                    priority=NextStepPriority.SUGGESTED,
                    action="Compare with other inverters",
                    reason="See if this is your best performer",
                    tool_hint="compare_loggers"
                )
            ]
        )
    """

    summary: str = Field(
        description="Human-readable base summary (always provided by tool)"
    )
    insights: list[Insight] = Field(
        default_factory=list,
        description="Domain-specific observations (0-5 insights)",
    )
    next_steps: list[NextStep] = Field(
        default_factory=list,
        description="Recommended follow-up actions (0-3 next steps)",
    )
    ui_suggestion: Optional[UISuggestion] = Field(
        default=None, description="UI rendering hint (optional)"
    )
    alert: Optional[str] = Field(
        default=None, description="Urgent message requiring immediate attention"
    )


# Helper functions for building context


def build_performance_insight(
    title: str,
    description: str,
    metric: Optional[str] = None,
    benchmark: Optional[str] = None,
    severity: InsightSeverity = InsightSeverity.INFO,
) -> Insight:
    """Build a performance-related insight."""
    return Insight(
        type=InsightType.PERFORMANCE,
        severity=severity,
        title=title,
        description=description,
        metric=metric,
        benchmark=benchmark,
    )


def build_financial_insight(
    title: str,
    description: str,
    metric: Optional[str] = None,
    benchmark: Optional[str] = None,
    severity: InsightSeverity = InsightSeverity.INFO,
) -> Insight:
    """Build a financial-related insight."""
    return Insight(
        type=InsightType.FINANCIAL,
        severity=severity,
        title=title,
        description=description,
        metric=metric,
        benchmark=benchmark,
    )


def build_operational_insight(
    title: str,
    description: str,
    metric: Optional[str] = None,
    severity: InsightSeverity = InsightSeverity.INFO,
) -> Insight:
    """Build an operational-related insight."""
    return Insight(
        type=InsightType.OPERATIONAL,
        severity=severity,
        title=title,
        description=description,
        metric=metric,
    )


def build_next_step(
    action: str,
    reason: str,
    priority: NextStepPriority = NextStepPriority.SUGGESTED,
    tool_hint: Optional[str] = None,
    params: Optional[dict] = None,
) -> NextStep:
    """Build a next step recommendation."""
    return NextStep(
        priority=priority,
        action=action,
        reason=reason,
        tool_hint=tool_hint,
        params=params,
    )
