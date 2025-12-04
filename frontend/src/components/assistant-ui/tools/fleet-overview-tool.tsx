'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { MetricCard, MetricCardGrid } from '@/components/ai/metric-card';
import { StatusBadge, type StatusType } from '@/components/ai/status-badge';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { Loader2, Zap, TrendingUp, Activity, Sun, Calendar, Clock, Sparkles } from 'lucide-react';
import { useSuggestionClick } from '../hooks/use-suggestion-click';

/**
 * Arguments for the get_fleet_overview tool
 */
interface FleetOverviewArgs {
  date?: string;
}

/**
 * Next step suggestion from the backend context
 */
interface NextStep {
  action: string;
  reason: string;
  priority: 'urgent' | 'recommended' | 'suggested' | 'optional';
  tool_hint?: string;
}

/**
 * Result structure from the get_fleet_overview tool
 */
interface FleetOverviewResult {
  success?: boolean;
  result?: {
    timestamp?: string;
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
    dateMismatch?: {
      requestedDate: string;
      actualDataDate: string;
      daysDifference: number;
      isHistorical: boolean;
    };
    summary?: string;
    context?: {
      next_steps?: NextStep[];
      summary?: string;
    };
  };
}

/**
 * FleetOverviewTool - Renders fleet overview for the get_fleet_overview tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const FleetOverviewTool = makeAssistantToolUI<FleetOverviewArgs, FleetOverviewResult>({
  toolName: 'get_fleet_overview',
  render: function FleetOverviewToolUI({ result, status }) {
    // Hook to handle suggestion clicks - sends action as new user message
    const handleSuggestionClick = useSuggestionClick();

    // Loading state
    if (status.type === 'running') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading fleet overview...</span>
          </div>
        </motion.div>
      );
    }

    // Error state
    if (status.type === 'incomplete') {
      return (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
        >
          <p className="text-sm text-red-800 dark:text-red-200">
            Failed to load fleet overview
          </p>
        </motion.div>
      );
    }

    // No result yet
    if (!result?.success || !result.result) {
      return null;
    }

    const data = result.result;
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
          {/* Date Mismatch Alert Banner */}
          {data.dateMismatch?.isHistorical && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
            >
              <Calendar className="h-4 w-4 shrink-0" />
              <div>
                <span className="font-medium">Historical Data:</span>{' '}
                Showing data from{' '}
                <span className="font-semibold">{data.dateMismatch.actualDataDate}</span>
                {' '}({data.dateMismatch.daysDifference} day{data.dateMismatch.daysDifference !== 1 ? 's' : ''} ago)
              </div>
            </motion.div>
          )}

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

          {/* Data Timestamp Footer */}
          {data.timestamp && (
            <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Data as of: {new Date(data.timestamp).toLocaleString()}</span>
            </div>
          )}

          {data.summary && (
            <p className="mt-3 text-sm text-muted-foreground">{data.summary}</p>
          )}

          {/* Suggestions from context.next_steps */}
          {data.context?.next_steps && data.context.next_steps.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-4 border-t border-border pt-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  Suggestions:
                </span>
                {data.context.next_steps.map((step, index) => (
                  <Button
                    key={index}
                    variant={step.priority === 'urgent' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSuggestionClick(step.action)}
                    className="h-7 text-xs"
                    title={step.reason}
                  >
                    {step.action}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    );
  },
});
