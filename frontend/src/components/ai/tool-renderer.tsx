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
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Error fallback component for tool rendering failures.
 * Displays a user-friendly error message instead of crashing the chat.
 */
function ToolErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
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
}: {
  suggestions: SuggestionItem[];
  onSuggestionClick?: (action: string) => void;
}) {
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
        {sortedSuggestions.map((suggestion, index) => (
          <EnhancedSuggestion
            key={index}
            label={suggestion.label}
            action={suggestion.action}
            priority={suggestion.priority}
            reason={suggestion.reason}
            badge={suggestion.badge}
            icon={suggestion.icon}
            onClick={onSuggestionClick || (() => {})}
          />
        ))}
      </div>
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
export function ToolRenderer({ toolInvocation, onUserSelection, onSuggestionClick }: ToolRendererProps) {
  const { toolName, args, state, toolCallId, result } = toolInvocation;

  // Hide internal tools - they appear in debug panel
  if (toolName === 'list_loggers') {
    return null;
  }

  // Handle request_user_selection - interactive dropdown or date picker
  if (toolName === 'request_user_selection') {
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

  // Handle render_ui_component - charts and custom components
  if (toolName === 'render_ui_component' && state === 'result') {
    const uiResult = result as {
      component: string;
      props: Record<string, unknown>;
      suggestions?: SuggestionItem[];
    } | undefined;

    // Also check args for suggestions (for pass-through before result)
    const suggestions = uiResult?.suggestions || (args.suggestions as SuggestionItem[] | undefined);

    if (uiResult?.component === 'DynamicChart') {
      return (
        <ErrorBoundary FallbackComponent={ToolErrorFallback}>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-4 w-full"
          >
            <DynamicChart {...(uiResult.props as unknown as DynamicChartProps)} />
            <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
          </motion.div>
        </ErrorBoundary>
      );
    }

    // Handle FleetOverview component from explicit flows
    if (uiResult?.component === 'FleetOverview') {
      const props = uiResult.props as {
        totalPower?: number;
        totalEnergy?: number;
        deviceCount?: number;
        onlineCount?: number;
        percentOnline?: number;
        alerts?: Array<{ type: string; message: string }>;
      };

      const health: StatusType =
        (props.percentOnline ?? 100) >= 100
          ? 'healthy'
          : (props.percentOnline ?? 100) >= 80
            ? 'warning'
            : 'critical';

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4" />
                Fleet Overview
              </h3>
              <StatusBadge status={health} size="sm" />
            </div>

            <MetricCardGrid columns={2}>
              <MetricCard
                label="Total Power"
                value={((props.totalPower ?? 0) / 1000).toFixed(1)}
                unit="kW"
                icon={<Zap className="h-4 w-4 text-amber-500" />}
                color="yellow"
              />
              <MetricCard
                label="Today's Energy"
                value={(props.totalEnergy ?? 0).toFixed(1)}
                unit="kWh"
                icon={<TrendingUp className="h-4 w-4 text-green-500" />}
                color="green"
              />
              <MetricCard
                label="Active Devices"
                value={`${props.onlineCount ?? 0}/${props.deviceCount ?? 0}`}
                icon={<Activity className="h-4 w-4 text-blue-500" />}
                color="blue"
              />
              <MetricCard
                label="Online"
                value={(props.percentOnline ?? 100).toFixed(0)}
                unit="%"
                icon={<Gauge className="h-4 w-4 text-green-500" />}
                color={health === 'healthy' ? 'green' : health === 'warning' ? 'yellow' : 'red'}
              />
            </MetricCardGrid>

            {props.alerts && props.alerts.length > 0 && (
              <div className="mt-3 space-y-1">
                {props.alerts.map((alert, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400"
                  >
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

    // Handle FinancialReport component from explicit flows
    if (uiResult?.component === 'FinancialReport') {
      const props = uiResult.props as {
        energyGenerated?: number;
        savings?: number;
        co2Offset?: number;
        treesEquivalent?: number;
        period?: { start: string; end: string };
        forecast?: { totalPredicted: number; days: Array<{ date: string; predictedEnergy: number }> };
      };

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
              <DollarSign className="h-4 w-4" />
              Financial Report
            </h3>
            <MetricCardGrid columns={2}>
              <MetricCard
                label="Energy Generated"
                value={(props.energyGenerated ?? 0).toFixed(1)}
                unit="kWh"
                icon={<Zap className="h-4 w-4 text-amber-500" />}
                color="yellow"
              />
              <MetricCard
                label="Savings"
                value={`$${(props.savings ?? 0).toFixed(2)}`}
                icon={<DollarSign className="h-4 w-4 text-green-500" />}
                color="green"
              />
              <MetricCard
                label="CO₂ Offset"
                value={(props.co2Offset ?? 0).toFixed(0)}
                unit="kg"
                icon={<Leaf className="h-4 w-4 text-emerald-500" />}
                color="green"
              />
              <MetricCard
                label="Trees Equivalent"
                value={(props.treesEquivalent ?? 0).toFixed(0)}
                unit="trees/yr"
                icon={<Trees className="h-4 w-4 text-green-600" />}
                color="green"
              />
            </MetricCardGrid>
            {props.forecast && (
              <div className="mt-3 rounded border border-green-200 bg-green-100/50 p-2 dark:border-green-700 dark:bg-green-800/30">
                <p className="text-xs text-green-700 dark:text-green-300">
                  <TrendingUp className="mr-1 inline h-3 w-3" />
                  7-day forecast: {props.forecast.totalPredicted.toFixed(1)} kWh
                </p>
              </div>
            )}
            {props.period && (
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>
                  {props.period.start} to {props.period.end}
                </span>
              </div>
            )}
          </div>
          <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
        </motion.div>
      );
    }

    // Handle HealthReport component from explicit flows
    if (uiResult?.component === 'HealthReport') {
      const props = uiResult.props as {
        loggerId?: string;
        period?: string;
        healthScore?: number;
        anomalies?: Array<{
          timestamp: string;
          type: string;
          description: string;
          severity: string;
          power: number;
          irradiance: number;
        }>;
      };

      const anomalyCount = props.anomalies?.length ?? 0;
      const status: StatusType =
        anomalyCount === 0 ? 'healthy' : anomalyCount < 5 ? 'warning' : 'critical';

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Health Report: {props.loggerId}
              </h3>
              <StatusBadge
                status={status}
                label={anomalyCount === 0 ? 'Healthy' : `${anomalyCount} Issues`}
                size="sm"
              />
            </div>

            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold">{props.healthScore ?? 100}%</span>
              <span className="text-sm text-muted-foreground">Health Score</span>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              Analysis period: {props.period || 'Last 7 days'}.
              {anomalyCount === 0
                ? ' No anomalies detected.'
                : ` Found ${anomalyCount} anomalies.`}
            </p>

            {props.anomalies && props.anomalies.length > 0 && (
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
                    {props.anomalies.slice(0, 10).map((anomaly, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {new Date(anomaly.timestamp).toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-right text-red-600">
                          {anomaly.power} W
                        </td>
                        <td className="px-2 py-1.5 text-right">{anomaly.irradiance} W/m²</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {props.anomalies.length > 10 && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    +{props.anomalies.length - 10} more...
                  </p>
                )}
              </div>
            )}
          </div>
          <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
        </motion.div>
      );
    }

    // Handle ComparisonChart component from explicit flows
    if (uiResult?.component === 'ComparisonChart') {
      const props = uiResult.props as unknown as DynamicChartProps;
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4 w-full"
        >
          <DynamicChart {...props} />
          <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={onSuggestionClick} />
        </motion.div>
      );
    }
  }

  // Custom renderer for calculate_financial_savings
  if (toolName === 'calculate_financial_savings' && state === 'result') {
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

    if (financialResult?.success && financialResult.result) {
      const data = financialResult.result;
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-4 dark:border-green-800 dark:from-green-900/20 dark:to-emerald-900/20">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-800 dark:text-green-200">
              <DollarSign className="h-4 w-4" />
              Financial Savings Report
            </h3>
            <MetricCardGrid columns={2}>
              <MetricCard
                label="Total Energy"
                value={(data.totalEnergyKwh ?? 0).toFixed(1)}
                unit="kWh"
                icon={<Zap className="h-4 w-4 text-amber-500" />}
                color="yellow"
              />
              <MetricCard
                label="Money Saved"
                value={`$${(data.savingsUsd ?? 0).toFixed(2)}`}
                icon={<DollarSign className="h-4 w-4 text-green-500" />}
                color="green"
              />
              <MetricCard
                label="CO₂ Offset"
                value={(data.co2OffsetKg ?? 0).toFixed(0)}
                unit="kg"
                icon={<Leaf className="h-4 w-4 text-emerald-500" />}
                color="green"
              />
              <MetricCard
                label="Trees Equivalent"
                value={(data.treesEquivalent ?? 0).toFixed(0)}
                unit="trees/year"
                icon={<Trees className="h-4 w-4 text-green-600" />}
                color="green"
              />
            </MetricCardGrid>
            {data.period && (
              <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>
                  {data.period.start} to {data.period.end} ({data.daysWithData} days)
                </span>
              </div>
            )}
          </div>
        </motion.div>
      );
    }
  }

  // Custom renderer for calculate_performance_ratio
  if (toolName === 'calculate_performance_ratio' && state === 'result') {
    const perfResult = result as {
      success?: boolean;
      result?: {
        performanceRatio?: number;
        status?: string;
        inferredCapacityKw?: number;
        interpretation?: string;
        metrics?: {
          avgPowerWatts?: number;
          peakPowerWatts?: number;
          avgIrradiance?: number;
        };
      };
    } | undefined;

    if (perfResult?.success && perfResult.result) {
      const data = perfResult.result;
      const statusMap: Record<string, StatusType> = {
        normal: 'normal',
        low: 'warning',
        critical: 'critical',
      };
      const status = statusMap[data.status || 'normal'] || 'info';

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 dark:border-blue-800 dark:from-blue-900/20 dark:to-indigo-900/20">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                <Gauge className="h-4 w-4" />
                Performance Analysis
              </h3>
              <StatusBadge status={status} size="sm" />
            </div>

            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-foreground">
                {(data.performanceRatio ?? 0).toFixed(1)}%
              </span>
              <span className="text-sm text-muted-foreground">Performance Ratio</span>
            </div>

            <MetricCardGrid columns={3}>
              <MetricCard
                label="Avg Power"
                value={((data.metrics?.avgPowerWatts ?? 0) / 1000).toFixed(2)}
                unit="kW"
                color="blue"
              />
              <MetricCard
                label="Peak Power"
                value={((data.metrics?.peakPowerWatts ?? 0) / 1000).toFixed(2)}
                unit="kW"
                color="blue"
              />
              <MetricCard
                label="Capacity"
                value={(data.inferredCapacityKw ?? 0).toFixed(1)}
                unit="kW"
                color="default"
              />
            </MetricCardGrid>

            {data.interpretation && (
              <p className="mt-3 text-sm text-muted-foreground">{data.interpretation}</p>
            )}
          </div>
        </motion.div>
      );
    }
  }

  // Custom renderer for get_fleet_overview
  if (toolName === 'get_fleet_overview' && state === 'result') {
    const fleetResult = result as {
      success?: boolean;
      result?: {
        status?: {
          totalLoggers?: number;
          activeLoggers?: number;
          percentOnline?: number;
          fleetHealth?: string;
        };
        production?: {
          currentTotalPowerWatts?: number;
          todayTotalEnergyKwh?: number;
          siteAvgIrradiance?: number;
        };
        summary?: string;
      };
    } | undefined;

    if (fleetResult?.success && fleetResult.result) {
      const data = fleetResult.result;
      const healthMap: Record<string, StatusType> = {
        Healthy: 'healthy',
        Degraded: 'warning',
        Critical: 'critical',
      };
      const health = healthMap[data.status?.fleetHealth || 'Healthy'] || 'info';

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Activity className="h-4 w-4" />
                Fleet Overview
              </h3>
              <StatusBadge status={health} label={data.status?.fleetHealth} size="sm" />
            </div>

            <MetricCardGrid columns={2}>
              <MetricCard
                label="Total Power"
                value={((data.production?.currentTotalPowerWatts ?? 0) / 1000).toFixed(1)}
                unit="kW"
                icon={<Zap className="h-4 w-4 text-amber-500" />}
                color="yellow"
              />
              <MetricCard
                label="Today's Energy"
                value={(data.production?.todayTotalEnergyKwh ?? 0).toFixed(1)}
                unit="kWh"
                icon={<TrendingUp className="h-4 w-4 text-green-500" />}
                color="green"
              />
              <MetricCard
                label="Active Devices"
                value={`${data.status?.activeLoggers ?? 0}/${data.status?.totalLoggers ?? 0}`}
                icon={<Activity className="h-4 w-4 text-blue-500" />}
                color="blue"
              />
              <MetricCard
                label="Avg Irradiance"
                value={(data.production?.siteAvgIrradiance ?? 0).toFixed(0)}
                unit="W/m²"
                icon={<Sun className="h-4 w-4 text-amber-500" />}
                color="default"
              />
            </MetricCardGrid>

            {data.summary && (
              <p className="mt-3 text-sm text-muted-foreground">{data.summary}</p>
            )}
          </div>
        </motion.div>
      );
    }
  }

  // Custom renderer for analyze_inverter_health
  if (toolName === 'analyze_inverter_health' && state === 'result') {
    const healthResult = result as {
      success?: boolean;
      result?: {
        type?: string;
        loggerId?: string;
        daysAnalyzed?: number;
        anomalyCount?: number;
        points?: Array<{
          timestamp: string;
          activePowerWatts?: number | null;
          irradiance?: number;
          reason?: string;
        }>;
      };
    } | undefined;

    if (healthResult?.success && healthResult.result) {
      const data = healthResult.result;
      const anomalyCount = data.anomalyCount ?? 0;
      const status: StatusType = anomalyCount === 0 ? 'healthy' : anomalyCount < 5 ? 'warning' : 'critical';

      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4" />
                Health Analysis: {data.loggerId}
              </h3>
              <StatusBadge
                status={status}
                label={anomalyCount === 0 ? 'No Issues' : `${anomalyCount} Anomalies`}
                size="sm"
              />
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              Analyzed {data.daysAnalyzed} days of data.
              {anomalyCount === 0
                ? ' No daytime outages detected.'
                : ` Found ${anomalyCount} daytime outages (power=0 when irradiance>50 W/m²).`}
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
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 text-muted-foreground">
                          {new Date(point.timestamp).toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-right text-red-600">
                          {point.activePowerWatts ?? 0} W
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {(point.irradiance ?? 0).toFixed(0)} W/m²
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.points.length > 10 && (
                  <p className="p-2 text-center text-xs text-muted-foreground">
                    +{data.points.length - 10} more anomalies...
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      );
    }
  }

  // Default: return null for other tools (they're shown in debug panel)
  return null;
}
