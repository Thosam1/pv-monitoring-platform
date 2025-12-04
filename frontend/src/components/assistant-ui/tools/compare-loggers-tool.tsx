'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { DynamicChart } from '@/components/dashboard/dynamic-chart';
import { motion } from 'framer-motion';
import { Loader2, Calendar } from 'lucide-react';

/**
 * Arguments for the compare_loggers tool
 */
interface CompareLoggersArgs {
  logger_ids: string[];
  metric?: string;
  date?: string;
}

/**
 * Result structure from the compare_loggers tool
 */
interface CompareLoggersResult {
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
}

// Chart colors for comparison lines
const COMPARISON_COLORS = ['#FDB813', '#3B82F6', '#22C55E', '#EF4444', '#A855F7', '#EC4899'];

/**
 * CompareLoggersTool - Renders comparison charts for the compare_loggers tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const CompareLoggersTool = makeAssistantToolUI<CompareLoggersArgs, CompareLoggersResult>({
  toolName: 'compare_loggers',
  render: function CompareLoggersToolUI({ args, result, status }) {
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
            <span>Comparing {args.logger_ids?.length || 0} loggers...</span>
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
            Failed to load comparison data
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
                {data.message || `No comparison data available for ${data.date}`}
              </p>
            </div>
          </div>
        </motion.div>
      );
    }

    // Build series from logger IDs
    const series = (data.loggerIds || []).map((loggerId, index) => ({
      dataKey: loggerId,
      name: loggerId,
      color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
      type: 'line' as const,
    }));

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-4 w-full"
      >
        <DynamicChart
          chartType="line"
          title={`${data.metric || 'Power'} Comparison - ${data.date || 'Latest'}`}
          xAxisKey="timestamp"
          yAxisLabel={data.metric === 'power' ? 'Power (W)' : data.metric || ''}
          series={series}
          data={data.data}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Comparing {data.loggerIds?.length || 0} loggers • {data.recordCount || 0} data points
        </p>
      </motion.div>
    );
  },
});
