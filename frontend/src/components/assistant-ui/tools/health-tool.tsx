'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { StatusBadge, type StatusType } from '@/components/ai/status-badge';
import { motion } from 'framer-motion';
import { Loader2, AlertTriangle } from 'lucide-react';

/**
 * Arguments for the analyze_inverter_health tool
 */
interface HealthArgs {
  logger_id: string;
  days?: number;
}

/**
 * Result structure from the analyze_inverter_health tool
 */
interface HealthResult {
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
}

/**
 * HealthTool - Renders health analysis for the analyze_inverter_health tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const HealthTool = makeAssistantToolUI<HealthArgs, HealthResult>({
  toolName: 'analyze_inverter_health',
  render: function HealthToolUI({ args, result, status }) {
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
            <span>Analyzing health for {args.logger_id}...</span>
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
            Failed to analyze health
          </p>
        </motion.div>
      );
    }

    // No result yet
    if (!result?.success || !result.result) {
      return null;
    }

    const data = result.result;
    const anomalyCount = data.anomalyCount ?? 0;
    const healthStatus: StatusType = anomalyCount === 0 ? 'healthy' : anomalyCount < 5 ? 'warning' : 'critical';

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
              status={healthStatus}
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
                  {data.points.slice(0, 10).map((point) => (
                    <tr key={point.timestamp} className="border-t border-border">
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
  },
});
