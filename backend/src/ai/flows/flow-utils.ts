import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  AnySuggestion,
  EnhancedPriority,
  EnhancedSuggestion,
  FlowContext,
  SuggestionIcon,
  SuggestionItem,
  ToolResponse,
  isRecoverableError,
  priorityToBadge,
} from '../types/flow-state';
import { ToolsHttpClient } from '../tools-http.client';

const logger = new Logger('FlowUtils');

/**
 * Execute a tool and return the parsed result.
 */
export async function executeTool<T = unknown>(
  httpClient: ToolsHttpClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse<T>> {
  try {
    const result = await httpClient.executeTool(toolName, args);
    return result as ToolResponse<T>;
  } catch (error) {
    logger.error(`Tool ${toolName} failed: ${error}`);
    return {
      status: 'error',
      message: `Tool execution failed: ${error}`,
    };
  }
}

/**
 * Create a tool call message for the LLM.
 */
export function createToolCallMessage(
  toolCallId: string,
  toolName: string,
  args: unknown,
): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [
      {
        id: toolCallId,
        name: toolName,
        args: args as Record<string, unknown>,
      },
    ],
  });
}

/**
 * Create a tool result message.
 */
export function createToolResultMessage(
  toolCallId: string,
  toolName: string,
  result: unknown,
): ToolMessage {
  return new ToolMessage({
    content: typeof result === 'string' ? result : JSON.stringify(result),
    tool_call_id: toolCallId,
    name: toolName,
  });
}

/**
 * Create render_ui_component arguments with suggestions.
 * Accepts both legacy SuggestionItem[] and EnhancedSuggestion[] arrays.
 */
export function createRenderArgs(
  component: string,
  props: Record<string, unknown>,
  suggestions: AnySuggestion[] = [],
): Record<string, unknown> {
  return {
    component,
    props,
    suggestions,
  };
}

/**
 * Create request_user_selection arguments.
 */
export function createSelectionArgs(options: {
  prompt: string;
  options: Array<{
    value: string;
    label: string;
    group?: string;
    subtitle?: string;
  }>;
  selectionType?: 'single' | 'multiple';
  inputType?: 'dropdown' | 'date' | 'date-range';
  minDate?: string;
  maxDate?: string;
  flowHint?: {
    expectedNext: string;
    skipOption?: { label: string; action: string };
  };
}): Record<string, unknown> {
  return {
    prompt: options.prompt,
    options: options.options,
    selectionType: options.selectionType || 'single',
    inputType: options.inputType || 'dropdown',
    minDate: options.minDate,
    maxDate: options.maxDate,
    flowHint: options.flowHint,
  };
}

/**
 * Generate a unique tool call ID.
 */
export function generateToolCallId(): string {
  return `tool_${randomUUID()}`;
}

/**
 * Check if the flow should trigger recovery based on tool response.
 */
export function shouldTriggerRecovery(response: ToolResponse): boolean {
  return isRecoverableError(response);
}

/**
 * Extract available date range from a no_data_in_window response.
 */
export function extractAvailableRange(
  response: ToolResponse,
): { start: string; end: string } | null {
  if (response.status === 'no_data_in_window' && response.availableRange) {
    return response.availableRange;
  }
  return null;
}

/**
 * Merge new context into existing flow context.
 */
export function mergeFlowContext(
  existing: FlowContext,
  updates: Partial<FlowContext>,
): FlowContext {
  return {
    ...existing,
    ...updates,
    toolResults: {
      ...existing.toolResults,
      ...updates.toolResults,
    },
  };
}

/**
 * Get the latest date string (YYYY-MM-DD) for today.
 */
export function getLatestDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate a date N days ago.
 */
export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Format logger options for selection from list_loggers response.
 */
export function formatLoggerOptions(loggersResult: {
  loggers?: Array<{
    loggerId: string;
    loggerType: string;
    dataRange?: { earliestData: string; latestData: string };
  }>;
}): Array<{ value: string; label: string; group: string; subtitle: string }> {
  const loggers = loggersResult?.loggers || [];

  return loggers.map((l) => ({
    value: l.loggerId,
    label: l.loggerId,
    group: l.loggerType,
    subtitle: l.dataRange
      ? `Data: ${l.dataRange.earliestData} to ${l.dataRange.latestData}`
      : 'No data range available',
  }));
}

/**
 * Extract the content of the last user message from the conversation.
 */
export function getLastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof HumanMessage || msg._getType() === 'human') {
      const content = msg.content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .map((c) =>
            typeof c === 'string' ? c : ((c as { text?: string }).text ?? ''),
          )
          .filter(Boolean)
          .join(' ');
      }
    }
  }
  return '';
}

/**
 * Pattern to detect "all devices" intent in user messages.
 * Matches variations like: "all devices", "fleet", "everything", "full fleet", "entire plant", etc.
 */
export const ALL_DEVICES_PATTERN =
  /\ball\s+(devices?|loggers?|inverters?)\b|\bfleet\b|\bevery\s+(device|logger|inverter)\b|\beach\s+(device|logger|inverter)\b|\bfull\s+fleet\b|\bthe\s+entire\s+(fleet|plant|system)\b|\beverything\b|\ball\s+of\s+them\b|\bwhole\s+(fleet|system)\b/i;

/**
 * Common suggestions for different flow outcomes.
 */
export const COMMON_SUGGESTIONS = {
  afterFleetOverview: (hasIssues: boolean): SuggestionItem[] =>
    hasIssues
      ? [
          {
            label: 'Diagnose issues',
            action: 'Run diagnostics on offline devices',
            priority: 'primary',
          },
          {
            label: 'Check health',
            action: 'Analyze health of the affected loggers',
            priority: 'secondary',
          },
        ]
      : [
          {
            label: 'Check efficiency',
            action: 'Calculate performance ratio for the fleet',
            priority: 'primary',
          },
          {
            label: 'Financial summary',
            action: 'Show financial savings for the past month',
            priority: 'secondary',
          },
        ],

  afterFinancialReport: (): SuggestionItem[] => [
    {
      label: 'Extend forecast',
      action: 'Forecast production for the next 30 days',
      priority: 'primary',
    },
    {
      label: 'Compare savings',
      action: 'Compare financial performance across all loggers',
      priority: 'secondary',
    },
  ],

  afterComparison: (): SuggestionItem[] => [
    {
      label: 'Compare energy',
      action: 'Compare total energy production instead of power',
      priority: 'primary',
    },
    {
      label: 'Health check',
      action: 'Check health for the lowest performer',
      priority: 'secondary',
    },
  ],

  afterHealthCheck: (hasAnomalies: boolean): SuggestionItem[] =>
    hasAnomalies
      ? [
          {
            label: 'Show power curve',
            action: 'Show power curve for the anomaly dates',
            priority: 'primary',
          },
          {
            label: 'Diagnose errors',
            action: 'Check error codes in metadata',
            priority: 'secondary',
          },
        ]
      : [
          {
            label: 'Check efficiency',
            action: 'Calculate performance ratio',
            priority: 'primary',
          },
          {
            label: 'Financial impact',
            action: 'Calculate financial savings',
            priority: 'secondary',
          },
        ],
};

// ============================================================
// Context Envelope Types (matching Python models/context.py)
// ============================================================

/**
 * Insight from MCP tool context.
 */
export interface ContextInsight {
  type: 'performance' | 'financial' | 'operational' | 'maintenance' | 'weather';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  metric?: string;
  benchmark?: string;
}

/**
 * Next step from MCP tool context.
 */
export interface ContextNextStep {
  priority: 'urgent' | 'recommended' | 'suggested' | 'optional';
  action: string;
  reason: string;
  tool_hint?: string;
  params?: Record<string, unknown>;
}

/**
 * UI suggestion from MCP tool context.
 */
export interface ContextUISuggestion {
  preferred_component: string;
  display_mode: 'compact' | 'standard' | 'detailed' | 'summary';
  highlight_metric?: string;
  color_scheme?: 'success' | 'warning' | 'danger' | 'neutral';
}

/**
 * Context envelope from MCP tool response.
 */
export interface ContextEnvelope {
  summary: string;
  insights: ContextInsight[];
  next_steps: ContextNextStep[];
  ui_suggestion?: ContextUISuggestion;
  alert?: string;
}

// ============================================================
// Context-to-Suggestions Conversion
// ============================================================

/**
 * Map tool hint to suggestion icon.
 */
function mapToolToIcon(toolHint?: string): SuggestionIcon | undefined {
  if (!toolHint) return undefined;

  const iconMap: Record<string, SuggestionIcon> = {
    diagnose_error_codes: 'alert',
    analyze_inverter_health: 'alert',
    calculate_financial_savings: 'dollar',
    calculate_performance_ratio: 'chart',
    compare_loggers: 'chart',
    forecast_production: 'lightbulb',
    get_power_curve: 'chart',
    get_fleet_overview: 'chart',
  };

  return iconMap[toolHint];
}

/**
 * Truncate action text for label display.
 */
function truncateLabel(action: string, maxWords = 4): string {
  const words = action.split(' ');
  if (words.length <= maxWords) return action;
  return words.slice(0, maxWords).join(' ') + '...';
}

/**
 * Convert MCP context next steps to frontend EnhancedSuggestion array.
 */
export function contextToSuggestions(
  context: ContextEnvelope | undefined,
): EnhancedSuggestion[] {
  if (!context?.next_steps?.length) return [];

  return context.next_steps.map((step) => ({
    label: truncateLabel(step.action),
    action: step.action,
    priority: step.priority as EnhancedPriority,
    reason: step.reason,
    badge: priorityToBadge(step.priority as EnhancedPriority),
    icon: mapToolToIcon(step.tool_hint),
    toolHint: step.tool_hint,
    params: step.params,
  }));
}

/**
 * Extract context envelope from tool result if present.
 * Checks multiple possible locations for context to handle structure variations.
 */
export function extractContextFromResult(
  result: ToolResponse,
): ContextEnvelope | undefined {
  const inner = result?.result;

  if (!inner || typeof inner !== 'object') {
    return undefined;
  }

  // Check multiple possible locations for context
  const innerRecord = inner as Record<string, unknown>;
  const context =
    innerRecord.context ||
    (innerRecord.data as Record<string, unknown> | undefined)?.context;

  if (context && typeof context === 'object') {
    return context as ContextEnvelope;
  }

  return undefined;
}

/**
 * Generate dynamic suggestions based on tool name and result.
 * Fallback when tool doesn't provide context envelope.
 */
export function generateDynamicSuggestions(
  toolName: string,
  result: ToolResponse,
): EnhancedSuggestion[] {
  // First, try to use context from the tool response
  const context = extractContextFromResult(result);

  // Honor explicit empty next_steps from tool (tool says "no suggestions")
  if (
    context &&
    'next_steps' in context &&
    Array.isArray(context.next_steps) &&
    context.next_steps.length === 0
  ) {
    return [];
  }

  if (context?.next_steps?.length) {
    return contextToSuggestions(context);
  }

  // Otherwise, generate based on tool-specific logic
  const suggestions: EnhancedSuggestion[] = [];

  switch (toolName) {
    case 'get_fleet_overview': {
      const fleet = result.result as {
        status?: { percentOnline?: number };
        devices?: { offline?: number };
      };
      const percentOnline = fleet?.status?.percentOnline ?? 100;

      if (percentOnline < 100) {
        const offlineCount = fleet?.devices?.offline ?? 0;
        suggestions.push({
          label: 'Diagnose issues',
          action: 'Run diagnostics on offline devices',
          priority: 'urgent',
          reason: `${offlineCount} device(s) are offline`,
          badge: '!',
          icon: 'alert',
          toolHint: 'diagnose_error_codes',
        });
      }

      if (percentOnline >= 90) {
        suggestions.push({
          label: 'Check efficiency',
          action: 'Calculate performance ratio for the fleet',
          priority: 'suggested',
          reason: 'System is healthy - optimize performance',
          badge: '>',
          icon: 'chart',
          toolHint: 'calculate_performance_ratio',
        });
      }
      break;
    }

    case 'analyze_inverter_health': {
      const health = result.result as { anomalyCount?: number };
      const anomalyCount = health?.anomalyCount ?? 0;

      if (anomalyCount > 0) {
        suggestions.push({
          label: 'Show affected days',
          action: 'Show power curve for the anomaly dates',
          priority: 'recommended',
          reason: `${anomalyCount} anomalies need investigation`,
          badge: '*',
          icon: 'chart',
          toolHint: 'get_power_curve',
        });
        suggestions.push({
          label: 'Check error codes',
          action: 'Diagnose error codes in metadata',
          priority: 'recommended',
          reason: 'May reveal underlying cause',
          badge: '*',
          icon: 'settings',
          toolHint: 'diagnose_error_codes',
        });
      } else {
        suggestions.push({
          label: 'Check efficiency',
          action: 'Calculate performance ratio',
          priority: 'suggested',
          reason: 'No anomalies - verify overall efficiency',
          badge: '>',
          icon: 'chart',
          toolHint: 'calculate_performance_ratio',
        });
      }
      break;
    }

    case 'calculate_performance_ratio': {
      const perf = result.result as { performanceRatio?: number };
      const ratio = perf?.performanceRatio ?? 100;

      if (ratio < 70) {
        suggestions.push({
          label: 'Investigate low efficiency',
          action: 'Analyze inverter health for potential issues',
          priority: 'urgent',
          reason: `Efficiency at ${ratio.toFixed(0)}% - well below typical 85%`,
          badge: '!',
          icon: 'alert',
          toolHint: 'analyze_inverter_health',
        });
      } else if (ratio < 85) {
        suggestions.push({
          label: 'Check for issues',
          action: 'Analyze inverter health',
          priority: 'recommended',
          reason: `Efficiency at ${ratio.toFixed(0)}% could be improved`,
          badge: '*',
          icon: 'chart',
          toolHint: 'analyze_inverter_health',
        });
      }
      break;
    }

    case 'calculate_financial_savings': {
      suggestions.push({
        label: 'Forecast future savings',
        action: 'Forecast production for the next 30 days',
        priority: 'suggested',
        reason: 'See projected savings',
        badge: '>',
        icon: 'dollar',
        toolHint: 'forecast_production',
      });
      break;
    }

    case 'get_power_curve': {
      suggestions.push({
        label: 'Compare inverters',
        action: 'Compare with other inverters on this date',
        priority: 'suggested',
        reason: 'See relative performance',
        badge: '>',
        icon: 'chart',
        toolHint: 'compare_loggers',
      });
      suggestions.push({
        label: 'Check efficiency',
        action: 'Calculate efficiency for this date',
        priority: 'suggested',
        reason: 'Verify output matches irradiance',
        badge: '>',
        icon: 'chart',
        toolHint: 'calculate_performance_ratio',
      });
      break;
    }
  }

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}

/**
 * Map color scheme from context to chart styling.
 */
export function mapColorSchemeToStyle(
  colorScheme?: ContextUISuggestion['color_scheme'],
): string {
  const styleMap: Record<string, string> = {
    success: '#22C55E',
    warning: '#F59E0B',
    danger: '#EF4444',
    neutral: '#6B7280',
  };
  return styleMap[colorScheme || 'neutral'] || styleMap.neutral;
}

/**
 * Map UI component hint to frontend component name.
 */
export function mapComponentHint(hint?: string): string {
  const componentMap: Record<string, string> = {
    chart_line: 'DynamicChart',
    chart_bar: 'DynamicChart',
    chart_composed: 'DynamicChart',
    chart_pie: 'DynamicChart',
    metric_card: 'MetricCard',
    metric_grid: 'MetricCardGrid',
    status_badge: 'StatusBadge',
    alert_banner: 'AlertBanner',
    data_table: 'DataTable',
  };
  return componentMap[hint || ''] || 'DynamicChart';
}

/**
 * Map UI component hint to chart type for DynamicChart.
 */
export function mapHintToChartType(
  hint?: string,
): 'line' | 'bar' | 'composed' | 'pie' | 'area' {
  const chartTypeMap: Record<
    string,
    'line' | 'bar' | 'composed' | 'pie' | 'area'
  > = {
    chart_line: 'line',
    chart_bar: 'bar',
    chart_composed: 'composed',
    chart_pie: 'pie',
  };
  return chartTypeMap[hint || ''] || 'composed';
}

// ============================================================
// Comparison Analysis Helpers
// ============================================================

/**
 * Logger performance summary from comparison results.
 */
export interface LoggerPerformance {
  loggerId: string;
  average: number;
  peak: number;
  total?: number;
}

/**
 * Comparison severity classification based on spread percentage.
 * Thresholds match Python comparison.py (lines 180-194).
 */
export type ComparisonSeverity =
  | 'similar' // < 10% spread - consistent performance
  | 'moderate_difference' // 10-30% spread - noticeable variation
  | 'large_difference'; // > 30% spread - significant gap

/**
 * Compute best performer from comparison summary stats.
 * Returns the logger with highest average metric value.
 *
 * @param summary - Summary stats from compare_loggers result
 * @returns Logger with highest average, or undefined if empty
 */
export function computeBestPerformer(
  summary: Record<string, { average: number; peak: number; total: number }>,
): LoggerPerformance | undefined {
  if (!summary || Object.keys(summary).length === 0) {
    return undefined;
  }

  let best: LoggerPerformance | undefined;
  let bestAvg = -Infinity;

  for (const [loggerId, stats] of Object.entries(summary)) {
    if (stats.average > bestAvg) {
      bestAvg = stats.average;
      best = {
        loggerId,
        average: stats.average,
        peak: stats.peak,
        total: stats.total,
      };
    }
  }

  return best;
}

/**
 * Compute worst performer from comparison summary stats.
 * Returns the logger with lowest average metric value.
 *
 * @param summary - Summary stats from compare_loggers result
 * @returns Logger with lowest average, or undefined if empty
 */
export function computeWorstPerformer(
  summary: Record<string, { average: number; peak: number; total: number }>,
): LoggerPerformance | undefined {
  if (!summary || Object.keys(summary).length === 0) {
    return undefined;
  }

  let worst: LoggerPerformance | undefined;
  let worstAvg = Infinity;

  for (const [loggerId, stats] of Object.entries(summary)) {
    if (stats.average < worstAvg) {
      worstAvg = stats.average;
      worst = {
        loggerId,
        average: stats.average,
        peak: stats.peak,
        total: stats.total,
      };
    }
  }

  return worst;
}

/**
 * Compute spread percentage between best and worst performers.
 * Uses same formula as Python comparison.py (line 175).
 *
 * @param best - Best performing logger
 * @param worst - Worst performing logger
 * @returns Percentage difference relative to best performer
 */
export function computeSpreadPercent(
  best: LoggerPerformance | undefined,
  worst: LoggerPerformance | undefined,
): number {
  if (!best || !worst || best.average === 0) {
    return 0;
  }

  return ((best.average - worst.average) / best.average) * 100;
}

/**
 * Classify comparison severity based on spread percentage.
 * Thresholds match Python comparison.py summary logic (lines 180-194).
 *
 * @param spreadPercent - Percentage difference between best and worst
 * @returns Severity classification
 */
export function computeComparisonSeverity(
  spreadPercent: number,
): ComparisonSeverity {
  if (spreadPercent < 10) {
    return 'similar';
  } else if (spreadPercent < 30) {
    return 'moderate_difference';
  } else {
    return 'large_difference';
  }
}
