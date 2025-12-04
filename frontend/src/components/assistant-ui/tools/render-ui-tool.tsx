'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { DynamicChart, type DynamicChartProps } from '@/components/dashboard/dynamic-chart';
import { MetricCard, MetricCardGrid } from '@/components/ai/metric-card';
import { StatusBadge, type StatusType } from '@/components/ai/status-badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useSuggestionClick } from '../hooks/use-suggestion-click';
import {
  Zap,
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

/**
 * Suggestion item for follow-up actions
 */
interface SuggestionItem {
  label: string;
  action: string;
  priority: 'primary' | 'secondary';
}

/**
 * Arguments for the render_ui_component tool
 */
interface RenderUIToolArgs {
  component: string;
  props: Record<string, unknown>;
  suggestions?: SuggestionItem[];
}

/**
 * Result from the render_ui_component tool (pass-through)
 */
interface RenderUIToolResult {
  component: string;
  props: Record<string, unknown>;
  suggestions?: SuggestionItem[];
}

/**
 * Loading state component
 */
function RenderUILoading() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Preparing visualization...</span>
      </div>
    </motion.div>
  );
}

/**
 * Renders suggestions from explicit flows as action chips.
 */
function FlowSuggestions({
  suggestions,
  onSuggestionClick,
}: {
  suggestions: SuggestionItem[];
  onSuggestionClick?: (action: string) => void;
}) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-3 flex flex-wrap gap-2"
    >
      <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Suggestions:
      </span>
      {suggestions.map((suggestion, index) => (
        <Button
          key={index}
          variant={suggestion.priority === 'primary' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSuggestionClick?.(suggestion.action)}
          className="h-7 text-xs"
        >
          {suggestion.label}
        </Button>
      ))}
    </motion.div>
  );
}

/**
 * Fleet Overview component
 */
function FleetOverview({
  props,
  suggestions,
  onSuggestionClick,
}: {
  props: {
    totalPower?: number;
    totalEnergy?: number;
    deviceCount?: number;
    onlineCount?: number;
    percentOnline?: number;
    alerts?: Array<{ type: string; message: string }>;
  };
  suggestions?: SuggestionItem[];
  onSuggestionClick?: (action: string) => void;
}) {
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

/**
 * Financial Report component
 */
function FinancialReport({
  props,
  suggestions,
  onSuggestionClick,
}: {
  props: {
    energyGenerated?: number;
    savings?: number;
    co2Offset?: number;
    treesEquivalent?: number;
    period?: { start: string; end: string };
    forecast?: { totalPredicted: number; days: Array<{ date: string; predictedEnergy: number }> };
  };
  suggestions?: SuggestionItem[];
  onSuggestionClick?: (action: string) => void;
}) {
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

/**
 * Health Report component
 */
function HealthReport({
  props,
  suggestions,
  onSuggestionClick,
}: {
  props: {
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
  suggestions?: SuggestionItem[];
  onSuggestionClick?: (action: string) => void;
}) {
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

/**
 * Tool UI for the render_ui_component tool.
 * Renders various UI components based on the component type.
 */
export const RenderUITool = makeAssistantToolUI<RenderUIToolArgs, RenderUIToolResult>({
  toolName: 'render_ui_component',
  render: function RenderUIToolUI({ args, result, status }) {
    // Hook to handle suggestion clicks - sends action as new user message
    const handleSuggestionClick = useSuggestionClick();

    // Show loading state while tool is running
    if (status.type === 'running') {
      return <RenderUILoading />;
    }

    // Type guard: Validate args/result structure to prevent React child errors
    // This can happen when tool args are malformed or when the LLM outputs
    // the args object as text instead of proper tool call structure
    if (!args || typeof args !== 'object') {
      console.warn('[RenderUITool] Invalid args:', args);
      return <RenderUILoading />;
    }

    // Use result if available, otherwise use args (pass-through pattern)
    const data = result || args;

    // Validate data structure
    if (!data || typeof data !== 'object' || typeof data.component !== 'string') {
      console.warn('[RenderUITool] Invalid data structure:', data);
      return <RenderUILoading />;
    }

    const suggestions = data.suggestions || args.suggestions;

    // Render based on component type
    switch (data.component) {
      case 'DynamicChart':
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-4 w-full"
          >
            <DynamicChart {...(data.props as unknown as DynamicChartProps)} />
            <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={handleSuggestionClick} />
          </motion.div>
        );

      case 'ComparisonChart':
        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-4 w-full"
          >
            <DynamicChart {...(data.props as unknown as DynamicChartProps)} />
            <FlowSuggestions suggestions={suggestions || []} onSuggestionClick={handleSuggestionClick} />
          </motion.div>
        );

      case 'FleetOverview':
        return (
          <FleetOverview
            props={data.props as Parameters<typeof FleetOverview>[0]['props']}
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
        );

      case 'FinancialReport':
        return (
          <FinancialReport
            props={data.props as Parameters<typeof FinancialReport>[0]['props']}
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
        );

      case 'HealthReport':
        return (
          <HealthReport
            props={data.props as Parameters<typeof HealthReport>[0]['props']}
            suggestions={suggestions}
            onSuggestionClick={handleSuggestionClick}
          />
        );

      default:
        // Unknown component - show debug info
        return (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
          >
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Unknown component: {data.component}
            </p>
          </motion.div>
        );
    }
  },
});
