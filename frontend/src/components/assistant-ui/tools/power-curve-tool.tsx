'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { DynamicChart } from '@/components/dashboard/dynamic-chart';
import { motion } from 'framer-motion';
import { Loader2, Calendar } from 'lucide-react';

/**
 * Arguments for the get_power_curve tool
 */
interface PowerCurveArgs {
  logger_id: string;
  date: string;
}

/**
 * Result structure from the get_power_curve tool
 */
interface PowerCurveResult {
  success?: boolean;
  result?: {
    loggerId?: string;
    date?: string;
    status?: string;
    recordCount?: number;
    data?: Array<{
      timestamp: string;
      power?: number | null;
      irradiance?: number | null;
    }>;
    summaryStats?: {
      peakValue?: number;
      peakTime?: string;
      avgValue?: number;
      totalEnergy?: number;
    };
    message?: string;
  };
}

/**
 * PowerCurveTool - Renders power curve charts for the get_power_curve tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const PowerCurveTool = makeAssistantToolUI<PowerCurveArgs, PowerCurveResult>({
  toolName: 'get_power_curve',
  render: function PowerCurveToolUI({ args, result, status }) {
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
            <span>Loading power curve for {args.logger_id}...</span>
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
            Failed to load power curve data
          </p>
        </motion.div>
      );
    }

    // No result yet
    if (!result?.success || !result.result) {
      return null;
    }

    const data = result.result;

    // Handle no data case
    if (!data.data || data.data.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {data.message || `No power curve data available for ${data.loggerId} on ${data.date}`}
              </p>
            </div>
          </div>
        </motion.div>
      );
    }

    // Transform data for DynamicChart
    const chartData = data.data.map(d => ({
      timestamp: d.timestamp,
      power: d.power ?? 0,
      irradiance: d.irradiance ?? 0,
    }));

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-4 w-full"
      >
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
        {/* Summary stats */}
        {data.summaryStats && (
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {data.summaryStats.peakValue !== undefined && (
              <span>Peak: <strong>{data.summaryStats.peakValue.toFixed(0)}W</strong> at {data.summaryStats.peakTime}</span>
            )}
            {data.summaryStats.avgValue !== undefined && (
              <span>Avg: <strong>{data.summaryStats.avgValue.toFixed(0)}W</strong></span>
            )}
            {data.summaryStats.totalEnergy !== undefined && (
              <span>Total: <strong>{data.summaryStats.totalEnergy.toFixed(1)} kWh</strong></span>
            )}
          </div>
        )}
      </motion.div>
    );
  },
});
