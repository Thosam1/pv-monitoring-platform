'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { DynamicChart } from '@/components/dashboard/dynamic-chart';
import { motion } from 'framer-motion';
import { Loader2, TrendingUp } from 'lucide-react';

/**
 * Arguments for the forecast_production tool
 */
interface ForecastArgs {
  logger_id: string;
  days?: number;
}

/**
 * Result structure from the forecast_production tool
 */
interface ForecastResult {
  success?: boolean;
  result?: {
    loggerId?: string;
    method?: string;
    basedOnDays?: number;
    historicalStats?: {
      averageKwh?: number;
      stdDevKwh?: number;
      minKwh?: number;
      maxKwh?: number;
    };
    forecasts?: Array<{
      date: string;
      expectedKwh: number;
      rangeMin: number;
      rangeMax: number;
      confidence: string;
    }>;
    summary?: string;
    message?: string;
  };
}

/**
 * ForecastTool - Renders forecast charts for the forecast_production tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const ForecastTool = makeAssistantToolUI<ForecastArgs, ForecastResult>({
  toolName: 'forecast_production',
  render: function ForecastToolUI({ args, result, status }) {
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
            <span>Generating forecast for {args.logger_id}...</span>
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
            Failed to generate forecast
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
    if (!data.forecasts || data.forecasts.length === 0) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-4"
        >
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {data.message || `Unable to generate forecast for ${data.loggerId}`}
              </p>
            </div>
          </div>
        </motion.div>
      );
    }

    // Transform forecast data for chart
    const chartData = data.forecasts.map(f => ({
      date: f.date,
      expected: f.expectedKwh,
      rangeMin: f.rangeMin,
      rangeMax: f.rangeMax,
    }));

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="my-4 w-full"
      >
        <DynamicChart
          chartType="bar"
          title={`Production Forecast - ${data.loggerId}`}
          xAxisKey="date"
          yAxisLabel="Energy (kWh)"
          series={[
            { dataKey: 'expected', name: 'Expected (kWh)', color: '#22C55E', type: 'bar' },
          ]}
          data={chartData}
        />
        {/* Forecast summary */}
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Method: <strong>{data.method || 'Statistical'}</strong></span>
          <span>Based on: <strong>{data.basedOnDays || 0} days</strong> of history</span>
          {data.historicalStats && (
            <span>Avg: <strong>{data.historicalStats.averageKwh?.toFixed(1)} kWh/day</strong></span>
          )}
        </div>
        {data.summary && (
          <p className="mt-2 text-sm text-muted-foreground">{data.summary}</p>
        )}
      </motion.div>
    );
  },
});
