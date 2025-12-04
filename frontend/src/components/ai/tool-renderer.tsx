'use client';

import { DynamicChart, type DynamicChartProps } from '@/components/dashboard/dynamic-chart';
import { SelectionPrompt, type SelectionOption } from './selection-prompt';
import { MetricCard, MetricCardGrid } from './metric-card';
import { StatusBadge, type StatusType } from './status-badge';
import {
  EnhancedSuggestion,
  type EnhancedPriority,
  type SuggestionIcon,
  type PriorityBadge,
} from './enhanced-suggestion';
import {
  sortSuggestionsByPriority,
  normalizeToEnhancedPriority,
  priorityToBadge,
} from './suggestion-utils';
import { motion } from 'framer-motion';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import {
  Zap,
  Sun,
  DollarSign,
  Leaf,
  Trees,
  Calendar,
  Activity,
  AlertTriangle,
  TrendingUp,
  Gauge,
  Sparkles,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Error fallback component for tool rendering failures.
 * Displays a user-friendly error message instead of crashing the chat.
 */
function ToolErrorFallback({ error, resetErrorBoundary }: Readonly<FallbackProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Failed to render component
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error.message || 'An unexpected error occurred'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={resetErrorBoundary}
            className="mt-2 h-7 text-xs"
          >
            Try Again
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Tool invocation type from AI SDK
interface ToolInvocationState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

/**
 * Legacy suggestion item for backward compatibility.
 */
export interface LegacySuggestionItem {
  label: string;
  action: string;
  priority: 'primary' | 'secondary';
}

/**
 * Enhanced suggestion item with priority badges and reasons.
 */
export interface EnhancedSuggestionItem {
  label: string;
  action: string;
  priority: EnhancedPriority;
  reason?: string;
  badge?: PriorityBadge;
  icon?: SuggestionIcon;
  toolHint?: string;
  params?: Record<string, unknown>;
}

/**
 * Union type for suggestions - supports both legacy and enhanced.
 */
export type SuggestionItem = LegacySuggestionItem | EnhancedSuggestionItem;

/**
 * Type guard to check if suggestion is enhanced.
 */
function isEnhancedSuggestion(
  suggestion: SuggestionItem
): suggestion is EnhancedSuggestionItem {
  return (
    'priority' in suggestion &&
    ['urgent', 'recommended', 'suggested', 'optional'].includes(suggestion.priority)
  );
}

export interface ToolRendererProps {
  toolInvocation: ToolInvocationState;
  onUserSelection?: (toolCallId: string, values: string[]) => void;
  onSuggestionClick?: (action: string) => void;
}

/**
 * Normalize a suggestion to enhanced format.
 */
function normalizeToEnhancedSuggestionItem(
  suggestion: SuggestionItem
): EnhancedSuggestionItem {
  if (isEnhancedSuggestion(suggestion)) {
    return {
      ...suggestion,
      badge: suggestion.badge ?? priorityToBadge(suggestion.priority),
    };
  }

  // Convert legacy suggestion
  const enhancedPriority = normalizeToEnhancedPriority(suggestion.priority);
  return {
    label: suggestion.label,
    action: suggestion.action,
    priority: enhancedPriority,
    badge: priorityToBadge(enhancedPriority),
  };
}

/**
 * Renders suggestions from explicit flows as action chips.
 * Supports both legacy and enhanced suggestion formats.
 */
function FlowSuggestions({
  suggestions,
  onSuggestionClick,
}: Readonly<{
  suggestions: SuggestionItem[];
  onSuggestionClick?: (action: string) => void;
}>) {
  if (!suggestions || suggestions.length === 0) return null;

  // Normalize all suggestions to enhanced format
  const enhancedSuggestions = suggestions.map(normalizeToEnhancedSuggestionItem);

  // Sort by priority (urgent first)
  const sortedSuggestions = sortSuggestionsByPriority(enhancedSuggestions);

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-4 space-y-2"
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        What would you like to do next?
      </span>
      <div className="flex flex-wrap gap-2">
        {sortedSuggestions.map((suggestion) => (
          <EnhancedSuggestion
            key={`${suggestion.label}-${suggestion.action}`}
            label={suggestion.label}
            action={suggestion.action}
            priority={suggestion.priority}
            reason={suggestion.reason}
            icon={suggestion.icon}
            onClick={onSuggestionClick || (() => {})}
          />
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// Individual Tool Renderers - Extracted to reduce cognitive complexity
// ============================================================================

/** Render request_user_selection tool */
function renderUserSelection(
  args: Record<string, unknown>,
  toolCallId: string,
  onUserSelection?: (toolCallId: string, values: string[]) => void,
): React.ReactElement {
  const selectionArgs = args as {
    prompt: string;
    options: SelectionOption[];
    selectionType?: 'single' | 'multiple';
    inputType?: 'dropdown' | 'date' | 'date-range';
    minDate?: string;
    maxDate?: string;
  };

  return (
    <ErrorBoundary FallbackComponent={ToolErrorFallback}>
      <SelectionPrompt
        prompt={selectionArgs.prompt}
        options={selectionArgs.options}
        selectionType={selectionArgs.selectionType || 'single'}
        inputType={selectionArgs.inputType || 'dropdown'}
        minDate={selectionArgs.minDate}
        maxDate={selectionArgs.maxDate}
        onSelect={(values) => onUserSelection?.(toolCallId, values)}
        disabled={!onUserSelection}
      />
    </ErrorBoundary>
  );
}

/** Render DynamicChart component */
function renderDynamicChart(
  props: Record<string, unknown>,
  suggestions: SuggestionItem[] | undefined,
  onSuggestionClick?: (action: string) => void,
): React.ReactElement {
  return (
    <ErrorBoundary FallbackComponent={ToolErrorFallback}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-4 w-full"
      >
        <DynamicChart {...(props as unknown as DynamicChartProps)} />
        <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
      </motion.div>
    </ErrorBoundary>
  );
}

/** Determine health status from percent online */
function getHealthStatus(percentOnline: number): StatusType {
  if (percentOnline >= 100) return 'healthy';
  if (percentOnline >= 80) return 'warning';
  return 'critical';
}

/** Map health status to metric card color to avoid nested ternary */
function getHealthColor(health: StatusType): 'green' | 'yellow' | 'red' {
  if (health === 'healthy') return 'green';
  if (health === 'warning') return 'yellow';
  return 'red';
}

/** Render FleetOverview component */
function renderFleetOverview(
  props: Record<string, unknown>,
  suggestions: SuggestionItem[] | undefined,
  onSuggestionClick?: (action: string) => void,
): React.ReactElement {
  const p = props as {
    totalPower?: number;
    totalEnergy?: number;
    deviceCount?: number;
    onlineCount?: number;
    percentOnline?: number;
    dataTimestamp?: string | null;
    dateMismatch?: {
      requestedDate: string;
      actualDataDate: string;
      daysDifference: number;
      isHistorical: boolean;
    } | null;
    alerts?: Array<{ type: string; message: string }>;
  };

  const health = getHealthStatus(p.percentOnline ?? 100);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-border bg-card p-4">
        {p.dateMismatch?.isHistorical && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
          >
            <Calendar className="h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Historical Data:</span> Showing data from{' '}
              <span className="font-semibold">{p.dateMismatch.actualDataDate}</span>
              {' '}({p.dateMismatch.daysDifference} day{p.dateMismatch.daysDifference === 1 ? '' : 's'} ago)
            </div>
          </motion.div>
        )}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4" />
            Fleet Overview
          </h3>
          <StatusBadge status={health} size="sm" />
        </div>
        <MetricCardGrid columns={2}>
          <MetricCard label="Total Power" value={((p.totalPower ?? 0) / 1000).toFixed(1)} unit="kW" icon={<Zap className="h-4 w-4 text-amber-500" />} color="yellow" />
          <MetricCard label="Today's Energy" value={(p.totalEnergy ?? 0).toFixed(1)} unit="kWh" icon={<TrendingUp className="h-4 w-4 text-green-500" />} color="green" />
          <MetricCard label="Active Devices" value={`${p.onlineCount ?? 0}/${p.deviceCount ?? 0}`} icon={<Activity className="h-4 w-4 text-blue-500" />} color="blue" />
          <MetricCard label="Online" value={(p.percentOnline ?? 100).toFixed(0)} unit="%" icon={<Gauge className="h-4 w-4 text-green-500" />} color={getHealthColor(health)} />
        </MetricCardGrid>
        {p.dataTimestamp && (
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Data as of: {new Date(p.dataTimestamp).toLocaleString()}</span>
          </div>
        )}
        {p.alerts && p.alerts.length > 0 && (
          <div className="mt-3 space-y-1">
            {p.alerts.map((alert, i) => (
              <div key={`alert-${i}-${alert.type}`} className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {alert.message}
              </div>
            ))}
          </div>
        )}
      </div>
      <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
    </motion.div>
  );
}

/** Render FinancialReport component */
function renderFinancialReport(
  props: Record<string, unknown>,
  suggestions: SuggestionItem[] | undefined,
  onSuggestionClick?: (action: string) => void,
): React.ReactElement {
  const p = props as {
    energyGenerated?: number;
    savings?: number;
    co2Offset?: number;
    treesEquivalent?: number;
    period?: { start: string; end: string };
    forecast?: { totalPredicted: number; days: Array<{ date: string; predictedEnergy: number }> };
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
          <DollarSign className="h-4 w-4" />
          Financial Report
        </h3>
        <MetricCardGrid columns={2}>
          <MetricCard label="Energy Generated" value={(p.energyGenerated ?? 0).toFixed(1)} unit="kWh" icon={<Zap className="h-4 w-4 text-amber-500" />} color="yellow" />
          <MetricCard label="Savings" value={`$${(p.savings ?? 0).toFixed(2)}`} icon={<DollarSign className="h-4 w-4 text-green-500" />} color="green" />
          <MetricCard label="CO₂ Offset" value={(p.co2Offset ?? 0).toFixed(0)} unit="kg" icon={<Leaf className="h-4 w-4 text-emerald-500" />} color="green" />
          <MetricCard label="Trees Equivalent" value={(p.treesEquivalent ?? 0).toFixed(0)} unit="trees/yr" icon={<Trees className="h-4 w-4 text-green-600" />} color="green" />
        </MetricCardGrid>
        {p.forecast && (
          <div className="mt-3 rounded border border-green-200 bg-green-100/50 p-2 dark:border-green-700 dark:bg-green-800/30">
            <p className="text-xs text-green-700 dark:text-green-300">
              <TrendingUp className="mr-1 inline h-3 w-3" />
              7-day forecast: {p.forecast.totalPredicted.toFixed(1)} kWh
            </p>
          </div>
        )}
        {p.period && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{p.period.start} to {p.period.end}</span>
          </div>
        )}
      </div>
      <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
    </motion.div>
  );
}

/** Get anomaly status from count */
function getAnomalyStatus(count: number): StatusType {
  if (count === 0) return 'healthy';
  if (count < 5) return 'warning';
  return 'critical';
}

/** Render HealthReport component */
function renderHealthReport(
  props: Record<string, unknown>,
  suggestions: SuggestionItem[] | undefined,
  onSuggestionClick?: (action: string) => void,
): React.ReactElement {
  const p = props as {
    loggerId?: string;
    period?: string;
    healthScore?: number;
    anomalies?: Array<{ timestamp: string; type: string; description: string; severity: string; power: number; irradiance: number }>;
  };

  const anomalyCount = p.anomalies?.length ?? 0;
  const status = getAnomalyStatus(anomalyCount);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Health Report: {p.loggerId}
          </h3>
          <StatusBadge status={status} label={anomalyCount === 0 ? 'Healthy' : `${anomalyCount} Issues`} size="sm" />
        </div>
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-2xl font-bold">{p.healthScore ?? 100}%</span>
          <span className="text-sm text-muted-foreground">Health Score</span>
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Analysis period: {p.period || 'Last 7 days'}.
          {anomalyCount === 0 ? ' No anomalies detected.' : ` Found ${anomalyCount} anomalies.`}
        </p>
        {p.anomalies && p.anomalies.length > 0 && (
          <div className="max-h-40 overflow-auto rounded border border-border bg-muted/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Time</th>
                  <th className="px-2 py-1.5 text-right font-medium">Power</th>
                  <th className="px-2 py-1.5 text-right font-medium">Irradiance</th>
                </tr>
              </thead>
              <tbody>
                {p.anomalies.slice(0, 10).map((anomaly, i) => (
                  <tr key={`anomaly-${i}-${anomaly.timestamp}`} className="border-t border-border">
                    <td className="px-2 py-1.5 text-muted-foreground">{new Date(anomaly.timestamp).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{anomaly.power} W</td>
                    <td className="px-2 py-1.5 text-right">{anomaly.irradiance} W/m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.anomalies.length > 10 && (
              <p className="p-2 text-center text-xs text-muted-foreground">+{p.anomalies.length - 10} more...</p>
            )}
          </div>
        )}
      </div>
      <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
    </motion.div>
  );
}

/**
 * Renders tool invocations with special handling for various tools.
 * - render_ui_component: Renders charts inline with suggestions
 * - request_user_selection: Renders interactive dropdown
 * - calculate_financial_savings: Custom financial card
 * - calculate_performance_ratio: Custom performance card
 * - get_fleet_overview: Custom fleet status card
 * - analyze_inverter_health: Custom health report
 * - Others: Hidden (shown in debug panel)
 */
export function ToolRenderer({ toolInvocation, onUserSelection, onSuggestionClick }: Readonly<ToolRendererProps>) {
  const { toolName, args, state, toolCallId, result } = toolInvocation;

  // Hide internal tools - they appear in debug panel
  if (toolName === 'list_loggers') {
    return null;
  }

  // Handle request_user_selection - interactive dropdown or date picker
  if (toolName === 'request_user_selection') {
    return renderUserSelection(args, toolCallId, onUserSelection);
  }

  // Handle render_ui_component - dispatch to specific renderers
  if (toolName === 'render_ui_component' && state === 'result') {
    return renderUiComponent(result, args, onSuggestionClick);
  }

  // Handle MCP tool results
  if (state === 'result') {
    return renderMcpToolResult(toolName, result);
  }

  return null;
}

/** Render UI component based on component type */
function renderUiComponent(
  result: unknown,
  args: Record<string, unknown>,
  onSuggestionClick?: (action: string) => void,
): React.ReactElement | null {
  const uiResult = result as {
    component: string;
    props: Record<string, unknown>;
    suggestions?: SuggestionItem[];
  } | undefined;

  if (!uiResult) return null;

  const suggestions = uiResult.suggestions || (args.suggestions as SuggestionItem[] | undefined);

  switch (uiResult.component) {
    case 'DynamicChart':
      return renderDynamicChart(uiResult.props, suggestions, onSuggestionClick);
    case 'FleetOverview':
      return renderFleetOverview(uiResult.props, suggestions, onSuggestionClick);
    case 'FinancialReport':
      return renderFinancialReport(uiResult.props, suggestions, onSuggestionClick);
    case 'HealthReport':
      return renderHealthReport(uiResult.props, suggestions, onSuggestionClick);
    case 'ComparisonChart':
      return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4 w-full">
          <DynamicChart {...(uiResult.props as unknown as DynamicChartProps)} />
          <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
        </motion.div>
      );
    default:
      return null;
  }
}

/** Render MCP tool results */
function renderMcpToolResult(toolName: string, result: unknown): React.ReactElement | null {
  switch (toolName) {
    case 'calculate_financial_savings':
      return renderFinancialSavings(result);
    case 'calculate_performance_ratio':
      return renderPerformanceRatio(result);
    case 'get_fleet_overview':
      return renderFleetOverviewResult(result);
    case 'analyze_inverter_health':
      return renderHealthAnalysis(result);
    case 'get_power_curve':
      return renderPowerCurve(result);
    case 'compare_loggers':
      return renderLoggerComparison(result);
    case 'forecast_production':
      return renderForecast(result);
    default:
      return null;
  }
}

/** Render financial savings result */
function renderFinancialSavings(result: unknown): React.ReactElement | null {
  const financialResult = result as {
    success?: boolean;
    result?: {
      totalEnergyKwh?: number;
      savingsUsd?: number;
      co2OffsetKg?: number;
      treesEquivalent?: number;
      daysWithData?: number;
      period?: { start: string; end: string };
    };
  } | undefined;

  if (!financialResult?.success || !financialResult.result) return null;
  const data = financialResult.result;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
          <DollarSign className="h-4 w-4" />
          Financial Savings Report
        </h3>
        <MetricCardGrid columns={2}>
          <MetricCard label="Total Energy" value={(data.totalEnergyKwh ?? 0).toFixed(1)} unit="kWh" icon={<Zap className="h-4 w-4 text-amber-500" />} color="yellow" />
          <MetricCard label="Money Saved" value={`$${(data.savingsUsd ?? 0).toFixed(2)}`} icon={<DollarSign className="h-4 w-4 text-green-500" />} color="green" />
          <MetricCard label="CO₂ Offset" value={(data.co2OffsetKg ?? 0).toFixed(0)} unit="kg" icon={<Leaf className="h-4 w-4 text-emerald-500" />} color="green" />
          <MetricCard label="Trees Equivalent" value={(data.treesEquivalent ?? 0).toFixed(0)} unit="trees/year" icon={<Trees className="h-4 w-4 text-green-600" />} color="green" />
        </MetricCardGrid>
        {data.period && (
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{data.period.start} to {data.period.end} ({data.daysWithData} days)</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Render performance ratio result */
function renderPerformanceRatio(result: unknown): React.ReactElement | null {
  const perfResult = result as {
    success?: boolean;
    result?: {
      performanceRatio?: number;
      status?: string;
      inferredCapacityKw?: number;
      interpretation?: string;
      metrics?: { avgPowerWatts?: number; peakPowerWatts?: number; avgIrradiance?: number };
    };
  } | undefined;

  if (!perfResult?.success || !perfResult.result) return null;
  const data = perfResult.result;
  const statusMap: Record<string, StatusType> = { normal: 'normal', low: 'warning', critical: 'critical' };
  const status = statusMap[data.status || 'normal'] || 'info';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
            <Gauge className="h-4 w-4" />
            Performance Analysis
          </h3>
          <StatusBadge status={status} size="sm" />
        </div>
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold text-foreground">{(data.performanceRatio ?? 0).toFixed(1)}%</span>
          <span className="text-sm text-muted-foreground">Performance Ratio</span>
        </div>
        <MetricCardGrid columns={3}>
          <MetricCard label="Avg Power" value={((data.metrics?.avgPowerWatts ?? 0) / 1000).toFixed(2)} unit="kW" color="blue" />
          <MetricCard label="Peak Power" value={((data.metrics?.peakPowerWatts ?? 0) / 1000).toFixed(2)} unit="kW" color="blue" />
          <MetricCard label="Capacity" value={(data.inferredCapacityKw ?? 0).toFixed(1)} unit="kW" color="default" />
        </MetricCardGrid>
        {data.interpretation && <p className="mt-3 text-sm text-muted-foreground">{data.interpretation}</p>}
      </div>
    </motion.div>
  );
}

/** Render fleet overview result from MCP tool */
function renderFleetOverviewResult(result: unknown): React.ReactElement | null {
  const fleetResult = result as {
    success?: boolean;
    result?: {
      timestamp?: string;
      status?: { totalLoggers?: number; activeLoggers?: number; percentOnline?: number; fleetHealth?: string };
      production?: { currentTotalPowerWatts?: number; todayTotalEnergyKwh?: number; siteAvgIrradiance?: number };
      dateMismatch?: { requestedDate: string; actualDataDate: string; daysDifference: number; isHistorical: boolean };
      summary?: string;
    };
  } | undefined;

  if (!fleetResult?.success || !fleetResult.result) return null;
  const data = fleetResult.result;
  const healthMap: Record<string, StatusType> = { Healthy: 'healthy', Degraded: 'warning', Critical: 'critical' };
  const health = healthMap[data.status?.fleetHealth || 'Healthy'] || 'info';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-border bg-card p-4">
        {data.dateMismatch?.isHistorical && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            <Calendar className="h-4 w-4 shrink-0" />
            <div>
              <span className="font-medium">Historical Data:</span> Showing data from <span className="font-semibold">{data.dateMismatch.actualDataDate}</span> ({data.dateMismatch.daysDifference} day{data.dateMismatch.daysDifference === 1 ? '' : 's'} ago)
            </div>
          </motion.div>
        )}
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4" />Fleet Overview</h3>
          <StatusBadge status={health} label={data.status?.fleetHealth} size="sm" />
        </div>
        <MetricCardGrid columns={2}>
          <MetricCard label="Total Power" value={((data.production?.currentTotalPowerWatts ?? 0) / 1000).toFixed(1)} unit="kW" icon={<Zap className="h-4 w-4 text-amber-500" />} color="yellow" />
          <MetricCard label="Today's Energy" value={(data.production?.todayTotalEnergyKwh ?? 0).toFixed(1)} unit="kWh" icon={<TrendingUp className="h-4 w-4 text-green-500" />} color="green" />
          <MetricCard label="Active Devices" value={`${data.status?.activeLoggers ?? 0}/${data.status?.totalLoggers ?? 0}`} icon={<Activity className="h-4 w-4 text-blue-500" />} color="blue" />
          <MetricCard label="Avg Irradiance" value={(data.production?.siteAvgIrradiance ?? 0).toFixed(0)} unit="W/m²" icon={<Sun className="h-4 w-4 text-amber-500" />} color="default" />
        </MetricCardGrid>
        {data.timestamp && (
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Data as of: {new Date(data.timestamp).toLocaleString()}</span>
          </div>
        )}
        {data.summary && <p className="mt-3 text-sm text-muted-foreground">{data.summary}</p>}
      </div>
    </motion.div>
  );
}

/** Render health analysis result */
function renderHealthAnalysis(result: unknown): React.ReactElement | null {
  const healthResult = result as {
    success?: boolean;
    result?: {
      type?: string;
      loggerId?: string;
      daysAnalyzed?: number;
      anomalyCount?: number;
      points?: Array<{ timestamp: string; activePowerWatts?: number | null; irradiance?: number; reason?: string }>;
    };
  } | undefined;

  if (!healthResult?.success || !healthResult.result) return null;
  const data = healthResult.result;
  const anomalyCount = data.anomalyCount ?? 0;
  const status = getAnomalyStatus(anomalyCount);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" />Health Analysis: {data.loggerId}</h3>
          <StatusBadge status={status} label={anomalyCount === 0 ? 'No Issues' : `${anomalyCount} Anomalies`} size="sm" />
        </div>
        <p className="mb-3 text-sm text-muted-foreground">
          Analyzed {data.daysAnalyzed} days of data.
          {anomalyCount === 0 ? ' No daytime outages detected.' : ` Found ${anomalyCount} daytime outages (power=0 when irradiance>50 W/m²).`}
        </p>
        {data.points && data.points.length > 0 && (
          <div className="max-h-40 overflow-auto rounded border border-border bg-muted/50">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Time</th>
                  <th className="px-2 py-1.5 text-right font-medium">Power</th>
                  <th className="px-2 py-1.5 text-right font-medium">Irradiance</th>
                </tr>
              </thead>
              <tbody>
                {data.points.slice(0, 10).map((point, i) => (
                  <tr key={`point-${i}-${point.timestamp}`} className="border-t border-border">
                    <td className="px-2 py-1.5 text-muted-foreground">{new Date(point.timestamp).toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right text-red-600">{point.activePowerWatts ?? 0} W</td>
                    <td className="px-2 py-1.5 text-right">{(point.irradiance ?? 0).toFixed(0)} W/m²</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.points.length > 10 && <p className="p-2 text-center text-xs text-muted-foreground">+{data.points.length - 10} more anomalies...</p>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/** Render no data message */
function renderNoDataMessage(message: string, icon: React.ReactElement): React.ReactElement {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-center gap-2">
          {icon}
          <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
        </div>
      </div>
    </motion.div>
  );
}

/** Render power curve result */
function renderPowerCurve(result: unknown): React.ReactElement | null {
  const powerCurveResult = result as {
    success?: boolean;
    result?: {
      loggerId?: string;
      date?: string;
      status?: string;
      recordCount?: number;
      data?: Array<{ timestamp: string; power?: number | null; irradiance?: number | null }>;
      summaryStats?: { peakValue?: number; peakTime?: string; avgValue?: number; totalEnergy?: number };
      message?: string;
    };
  } | undefined;

  if (!powerCurveResult?.success || !powerCurveResult.result) return null;
  const data = powerCurveResult.result;

  if (!data.data || data.data.length === 0) {
    return renderNoDataMessage(data.message || `No power curve data available for ${data.loggerId} on ${data.date}`, <Calendar className="h-4 w-4 text-amber-600" />);
  }

  const chartData = data.data.map(d => ({ timestamp: d.timestamp, power: d.power ?? 0, irradiance: d.irradiance ?? 0 }));

  return (
    <ErrorBoundary FallbackComponent={ToolErrorFallback}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4 w-full">
        <DynamicChart
          chartType="composed"
          title={`Power Curve - ${data.loggerId} (${data.date})`}
          xAxisKey="timestamp"
          yAxisLabel="Power (W)"
          series={[
            { dataKey: 'power', name: 'Power (W)', color: '#FDB813', type: 'area', fillOpacity: 0.3 },
            { dataKey: 'irradiance', name: 'Irradiance (W/m²)', color: '#3B82F6', type: 'line', yAxisId: 'right' },
          ]}
          data={chartData}
        />
        {data.summaryStats && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {data.summaryStats.peakValue !== undefined && <span>Peak: <strong>{data.summaryStats.peakValue.toFixed(0)}W</strong> at {data.summaryStats.peakTime}</span>}
            {data.summaryStats.avgValue !== undefined && <span>Avg: <strong>{data.summaryStats.avgValue.toFixed(0)}W</strong></span>}
            {data.summaryStats.totalEnergy !== undefined && <span>Total: <strong>{data.summaryStats.totalEnergy.toFixed(1)} kWh</strong></span>}
          </div>
        )}
      </motion.div>
    </ErrorBoundary>
  );
}

/** Render logger comparison result */
function renderLoggerComparison(result: unknown): React.ReactElement | null {
  const comparisonResult = result as {
    success?: boolean;
    result?: {
      metric?: string;
      loggerIds?: string[];
      date?: string;
      status?: string;
      recordCount?: number;
      data?: Array<Record<string, unknown>>;
      message?: string;
    };
  } | undefined;

  if (!comparisonResult?.success || !comparisonResult.result) return null;
  const data = comparisonResult.result;

  if (!data.data || data.data.length === 0) {
    return renderNoDataMessage(data.message || `No comparison data available for ${data.date}`, <Calendar className="h-4 w-4 text-amber-600" />);
  }

  const colors = ['#FDB813', '#3B82F6', '#22C55E', '#EF4444', '#A855F7', '#EC4899'];
  const series = (data.loggerIds || []).map((loggerId, index) => ({
    dataKey: loggerId,
    name: loggerId,
    color: colors[index % colors.length],
    type: 'line' as const,
  }));

  return (
    <ErrorBoundary FallbackComponent={ToolErrorFallback}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4 w-full">
        <DynamicChart
          chartType="line"
          title={`${data.metric || 'Power'} Comparison - ${data.date || 'Latest'}`}
          xAxisKey="timestamp"
          yAxisLabel={data.metric === 'power' ? 'Power (W)' : data.metric || ''}
          series={series}
          data={data.data}
        />
        <p className="mt-2 text-xs text-muted-foreground">Comparing {data.loggerIds?.length || 0} loggers • {data.recordCount || 0} data points</p>
      </motion.div>
    </ErrorBoundary>
  );
}

/** Render forecast result */
function renderForecast(result: unknown): React.ReactElement | null {
  const forecastResult = result as {
    success?: boolean;
    result?: {
      loggerId?: string;
      method?: string;
      basedOnDays?: number;
      historicalStats?: { averageKwh?: number; stdDevKwh?: number; minKwh?: number; maxKwh?: number };
      forecasts?: Array<{ date: string; expectedKwh: number; rangeMin: number; rangeMax: number; confidence: string }>;
      summary?: string;
      message?: string;
    };
  } | undefined;

  if (!forecastResult?.success || !forecastResult.result) return null;
  const data = forecastResult.result;

  if (!data.forecasts || data.forecasts.length === 0) {
    return renderNoDataMessage(data.message || `Unable to generate forecast for ${data.loggerId}`, <TrendingUp className="h-4 w-4 text-amber-600" />);
  }

  const chartData = data.forecasts.map(f => ({ date: f.date, expected: f.expectedKwh, rangeMin: f.rangeMin, rangeMax: f.rangeMax }));

  return (
    <ErrorBoundary FallbackComponent={ToolErrorFallback}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="my-4 w-full">
        <DynamicChart
          chartType="bar"
          title={`Production Forecast - ${data.loggerId}`}
          xAxisKey="date"
          yAxisLabel="Energy (kWh)"
          series={[{ dataKey: 'expected', name: 'Expected (kWh)', color: '#22C55E', type: 'bar' }]}
          data={chartData}
        />
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Method: <strong>{data.method || 'Statistical'}</strong></span>
          <span>Based on: <strong>{data.basedOnDays || 0} days</strong> of history</span>
          {data.historicalStats && <span>Avg: <strong>{data.historicalStats.averageKwh?.toFixed(1)} kWh/day</strong></span>}
        </div>
        {data.summary && <p className="mt-2 text-sm text-muted-foreground">{data.summary}</p>}
      </motion.div>
    </ErrorBoundary>
  );
}
