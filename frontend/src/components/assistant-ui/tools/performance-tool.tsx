'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { MetricCard, MetricCardGrid } from '@/components/ai/metric-card';
import { StatusBadge, type StatusType } from '@/components/ai/status-badge';
import { motion } from 'framer-motion';
import { Loader2, Gauge } from 'lucide-react';

/**
 * Arguments for the calculate_performance_ratio tool
 */
interface PerformanceArgs {
  logger_id: string;
  date?: string;
}

/**
 * Result structure from the calculate_performance_ratio tool
 */
interface PerformanceResult {
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
}

/**
 * PerformanceTool - Renders performance ratio for the calculate_performance_ratio tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const PerformanceTool = makeAssistantToolUI<PerformanceArgs, PerformanceResult>({
  toolName: 'calculate_performance_ratio',
  render: function PerformanceToolUI({ args, result, status }) {
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
            <span>Calculating performance ratio for {args.logger_id}...</span>
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
            Failed to calculate performance ratio
          </p>
        </motion.div>
      );
    }

    // No result yet
    if (!result?.success || !result.result) {
      return null;
    }

    const data = result.result;
    const statusMap: Record<string, StatusType> = {
      normal: 'normal',
      low: 'warning',
      critical: 'critical',
    };
    const perfStatus = statusMap[data.status || 'normal'] || 'info';

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
            <StatusBadge status={perfStatus} size="sm" />
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
  },
});
