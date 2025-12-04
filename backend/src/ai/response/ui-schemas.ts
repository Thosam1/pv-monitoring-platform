/**
 * UI Component Schemas
 *
 * Zod schemas for validating render_ui_component props before sending to frontend.
 * These schemas ensure type safety at runtime and provide clear error messages
 * when flows construct invalid props.
 */
import { z } from 'zod';

// ============================================================================
// HealthReport Schema
// Used by: health-check.flow.ts (single logger analysis)
// ============================================================================
export const HealthReportSchema = z.object({
  loggerId: z.string(),
  period: z.string().optional(),
  healthScore: z.number().min(0).max(100),
  anomalies: z
    .array(
      z.object({
        timestamp: z.string(),
        type: z.string(),
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
        power: z.number().optional(),
        irradiance: z.number().optional(),
      }),
    )
    .default([]),
});

// ============================================================================
// FleetHealthReport Schema
// Used by: health-check.flow.ts (all devices analysis)
// ============================================================================
export const FleetHealthReportSchema = z.object({
  period: z.string().optional(),
  totalLoggers: z.number(),
  avgHealthScore: z.number().min(0).max(100),
  totalAnomalies: z.number(),
  loggersWithIssues: z.number(),
  loggers: z.array(
    z.object({
      loggerId: z.string(),
      loggerType: z.string(),
      healthScore: z.number(),
      anomalyCount: z.number(),
      status: z.string(),
    }),
  ),
});

// ============================================================================
// FinancialReport Schema
// Used by: financial-report.flow.ts
// ============================================================================
export const FinancialReportSchema = z.object({
  energyGenerated: z.number(),
  savings: z.number(),
  co2Offset: z.number(),
  treesEquivalent: z.number().optional(),
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),
  forecast: z
    .object({
      totalPredicted: z.number(),
      // days can be undefined if API returns different field name (e.g., dailyForecasts)
      days: z
        .array(
          z.object({
            date: z.string(),
            predictedEnergy: z.number(),
          }),
        )
        .optional()
        .default([]),
    })
    .optional(),
});

// ============================================================================
// FleetOverview Schema
// Used by: morning-briefing.flow.ts
// ============================================================================

/** Date mismatch information when viewing historical data */
const DateMismatchSchema = z.object({
  requestedDate: z.string(),
  actualDataDate: z.string(),
  daysDifference: z.number(),
  isHistorical: z.boolean(),
});

export const FleetOverviewSchema = z.object({
  totalPower: z.number(),
  totalEnergy: z.number(),
  deviceCount: z.number(),
  onlineCount: z.number(),
  percentOnline: z.number().min(0).max(100),
  dataTimestamp: z.string().nullable().optional(),
  dateMismatch: DateMismatchSchema.nullable().optional(),
  alerts: z
    .array(
      z.object({
        type: z.enum(['info', 'warning', 'error']),
        message: z.string(),
      }),
    )
    .optional(),
});

// ============================================================================
// ComparisonChart Schema (Legacy)
// Used by: performance-audit.flow.ts (kept for backward compatibility)
// ============================================================================
export const ComparisonChartSchema = z.object({
  loggerIds: z.array(z.string()),
  metric: z.enum(['power', 'energy', 'irradiance']),
  date: z.string().optional(),
  data: z.array(z.record(z.string(), z.unknown())),
  summaryStats: z
    .record(
      z.string(),
      z.object({
        average: z.number(),
        peak: z.number(),
        total: z.number(),
      }),
    )
    .optional(),
});

// ============================================================================
// DynamicChart Schema (Generative UI)
// Replaces PerformanceChart/ComparisonChart for flexible chart rendering
// Used by: performance-audit.flow.ts, future flows
// ============================================================================
export const DynamicChartSchema = z.object({
  chartType: z.enum(['area', 'bar', 'line', 'scatter', 'pie', 'composed']),
  title: z.string(),
  xAxisKey: z.string(),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  series: z.array(
    z.object({
      dataKey: z.string(),
      name: z.string(),
      type: z.enum(['area', 'bar', 'line', 'scatter']).optional(),
      color: z.string().optional(),
      yAxisId: z.enum(['left', 'right']).optional(),
      fillOpacity: z.number().optional(),
    }),
  ),
  data: z.array(z.record(z.string(), z.unknown())),
  showLegend: z.boolean().optional(),
  showGrid: z.boolean().optional(),
  showTooltip: z.boolean().optional(),
  summaryStats: z.record(z.string(), z.unknown()).optional(),
});

// ============================================================================
// PowerCurve Schema
// Used by: power curve tool rendering
// ============================================================================
export const PowerCurveSchema = z.object({
  loggerId: z.string(),
  date: z.string(),
  data: z.array(
    z.object({
      timestamp: z.string(),
      power: z.number(),
      irradiance: z.number().optional(),
    }),
  ),
  summary: z
    .object({
      peakPower: z.number(),
      totalEnergy: z.number(),
      avgIrradiance: z.number().optional(),
    })
    .optional(),
});

// ============================================================================
// ForecastChart Schema
// Used by: forecast tool rendering
// ============================================================================
export const ForecastChartSchema = z.object({
  loggerId: z.string(),
  forecasts: z.array(
    z.object({
      date: z.string(),
      predictedEnergy: z.number(),
    }),
  ),
  totalPredicted: z.number(),
});

// ============================================================================
// Type Aliases for TypeScript
// ============================================================================
export type HealthReportProps = z.infer<typeof HealthReportSchema>;
export type FleetHealthReportProps = z.infer<typeof FleetHealthReportSchema>;
export type FinancialReportProps = z.infer<typeof FinancialReportSchema>;
export type FleetOverviewProps = z.infer<typeof FleetOverviewSchema>;
export type ComparisonChartProps = z.infer<typeof ComparisonChartSchema>;
export type DynamicChartProps = z.infer<typeof DynamicChartSchema>;
export type PowerCurveProps = z.infer<typeof PowerCurveSchema>;
export type ForecastChartProps = z.infer<typeof ForecastChartSchema>;
