'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
import { MetricCard, MetricCardGrid } from '@/components/ai/metric-card';
import { motion } from 'framer-motion';
import { Loader2, Zap, DollarSign, Leaf, Trees, Calendar } from 'lucide-react';

/**
 * Arguments for the calculate_financial_savings tool
 */
interface FinancialArgs {
  logger_id?: string;
  start_date?: string;
  end_date?: string;
}

/**
 * Result structure from the calculate_financial_savings tool
 */
interface FinancialResult {
  success?: boolean;
  result?: {
    totalEnergyKwh?: number;
    savingsUsd?: number;
    co2OffsetKg?: number;
    treesEquivalent?: number;
    daysWithData?: number;
    period?: { start: string; end: string };
  };
}

/**
 * FinancialTool - Renders financial savings for the calculate_financial_savings tool.
 * Registered with assistant-ui to automatically render when the tool is called.
 */
export const FinancialTool = makeAssistantToolUI<FinancialArgs, FinancialResult>({
  toolName: 'calculate_financial_savings',
  render: function FinancialToolUI({ result, status }) {
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
            <span>Calculating financial savings...</span>
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
            Failed to calculate financial savings
          </p>
        </motion.div>
      );
    }

    // No result yet
    if (!result?.success || !result.result) {
      return null;
    }

    const data = result.result;

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
              label="CO2 Offset"
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
  },
});
