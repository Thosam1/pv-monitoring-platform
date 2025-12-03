/**
 * Context interfaces for narrative generation.
 * Provides rich context about data quality, historical patterns, and flow state.
 */

import { FlowType, FleetStatusSnapshot } from '../types/flow-state';

/**
 * Data quality indicators for narrative awareness.
 * Enables narratives that acknowledge data limitations.
 */
export interface DataQualityIndicators {
  /**
   * Percentage of requested data that is available (0-100).
   * Below 50% triggers 'data_incomplete' branch.
   */
  completeness: number;

  /**
   * Whether data is from the expected time window.
   * False triggers 'data_stale' branch with explanation.
   */
  isExpectedWindow: boolean;

  /**
   * The actual time window when data differs from expected.
   */
  actualWindow?: {
    start: string;
    end: string;
  };

  /**
   * Confidence score from tool results (0-1).
   * Low confidence can modify narrative tone.
   */
  confidence?: number;

  /**
   * List of missing or incomplete data fields.
   * Used for specific explanations in narrative.
   */
  missingFields?: string[];
}

/**
 * Historical context for detecting patterns and trends.
 * Enables narratives that reference recurring issues or trends.
 */
export interface HistoricalContext {
  /**
   * Whether this anomaly/pattern has been seen before.
   * True triggers 'recurrent_issue' branch.
   */
  isRecurrent: boolean;

  /**
   * Previous occurrences if the issue is recurrent.
   */
  previousOccurrences?: Array<{
    date: string;
    severity: string;
  }>;

  /**
   * Trend direction over time.
   * 'degrading' triggers 'trend_degrading' branch.
   */
  trend?: 'improving' | 'stable' | 'degrading';

  /**
   * Days since last similar issue.
   */
  daysSinceLastOccurrence?: number;
}

/**
 * Anomaly structure from health analysis.
 */
export interface AnomalyData {
  timestamp: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  metrics?: {
    power?: number;
    irradiance?: number;
  };
}

/**
 * Rich context object passed to NarrativeEngine for generation.
 * Contains all information needed to generate appropriate narratives.
 */
export interface NarrativeContext {
  /**
   * Flow type triggering the narrative.
   * Determines base prompt template and suggestion strategy.
   */
  flowType: Exclude<FlowType, 'free_chat'>;

  /**
   * Primary subject of the narrative.
   * For single logger: loggerId (e.g., '925')
   * For fleet analysis: 'fleet'
   */
  subject: string;

  /**
   * Raw data from tool results.
   * Structure varies by flow type:
   * - health_check: { anomalies, healthScore, period }
   * - morning_briefing: { percentOnline, offlineDevices, diagnosis }
   * - financial_report: { savings, energyGenerated, co2Offset }
   * - performance_audit: {
   *     comparison,
   *     summaryStats,
   *     loggerIds,
   *     bestPerformer: { loggerId, average, peak },
   *     worstPerformer: { loggerId, average, peak },
   *     spreadPercent: number,
   *     comparisonSeverity: 'similar' | 'moderate_difference' | 'large_difference'
   *   }
   */
  data: Record<string, unknown>;

  /**
   * Data quality indicators for uncertainty-aware narratives.
   */
  dataQuality: DataQualityIndicators;

  /**
   * Historical context for pattern detection.
   * Optional - not all flows track history.
   */
  historicalContext?: HistoricalContext;

  /**
   * User's original query for relevance alignment.
   */
  userQuery?: string;

  /**
   * Whether this is a fleet-wide analysis.
   */
  isFleetAnalysis?: boolean;

  /**
   * Number of loggers in fleet analysis.
   */
  fleetSize?: number;

  /**
   * Temporal context for "compared to yesterday" narratives.
   */
  temporalContext?: TemporalContext;
}

// =============================================================================
// TEMPORAL CONTEXT - For "compared to yesterday" narratives
// =============================================================================

/**
 * Temporal context for narrative comparisons.
 * Enables "compared to yesterday" phrasing in morning briefings.
 */
export interface TemporalContext {
  /** Previous status snapshot (if available) */
  previousStatus?: FleetStatusSnapshot;
  /** Change in percent online (+5 or -10) */
  deltaPercentOnline?: number;
  /** Devices that came back online since last check */
  newlyOnline?: string[];
  /** Devices that went offline since last check */
  newlyOffline?: string[];
  /** Overall trend direction */
  trend: 'improving' | 'stable' | 'declining';
  /** Number of days/checks with data for trend */
  daysTracked: number;
}

/**
 * Helper to extract anomalies from context data.
 */
export function extractAnomalies(data: Record<string, unknown>): AnomalyData[] {
  const anomalies = data.anomalies;
  if (!Array.isArray(anomalies)) {
    return [];
  }
  return anomalies as AnomalyData[];
}

/**
 * Helper to extract health score from context data.
 */
export function extractHealthScore(data: Record<string, unknown>): number {
  const score = data.healthScore;
  if (typeof score === 'number') {
    return score;
  }
  return 100; // Default to healthy if not provided
}

/**
 * Helper to count anomalies by severity.
 */
export function countBySeverity(
  anomalies: AnomalyData[],
): Record<'low' | 'medium' | 'high', number> {
  return anomalies.reduce(
    (acc, a) => {
      acc[a.severity] = (acc[a.severity] || 0) + 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 },
  );
}

/**
 * Create default data quality indicators for complete data.
 */
export function createDefaultDataQuality(): DataQualityIndicators {
  return {
    completeness: 100,
    isExpectedWindow: true,
    confidence: 1,
  };
}

/**
 * Valid comparison severity values.
 */
export type ComparisonSeverity =
  | 'similar'
  | 'moderate_difference'
  | 'large_difference';

/**
 * Helper to extract comparison severity from context data.
 * Used by performance_audit flow for branch selection.
 */
export function extractComparisonSeverity(
  data: Record<string, unknown>,
): ComparisonSeverity | undefined {
  const severity = data.comparisonSeverity;
  if (
    severity === 'similar' ||
    severity === 'moderate_difference' ||
    severity === 'large_difference'
  ) {
    return severity;
  }
  return undefined;
}

/**
 * Helper to extract spread percent from context data.
 * Returns 0 if not present.
 */
export function extractSpreadPercent(data: Record<string, unknown>): number {
  const spread = data.spreadPercent;
  if (typeof spread === 'number') {
    return spread;
  }
  return 0;
}

// =============================================================================
// TEMPORAL CONTEXT BUILDERS
// =============================================================================

/**
 * Current fleet status for temporal comparison.
 */
export interface CurrentFleetStatus {
  percentOnline: number;
  offlineLoggers: string[];
}

/**
 * Build temporal context by comparing current and previous status.
 * Returns stable trend with 1 day tracked if no previous status.
 *
 * @param current - Current fleet status
 * @param previous - Optional previous fleet snapshot
 * @returns Temporal context for narrative generation
 */
export function buildTemporalContext(
  current: CurrentFleetStatus,
  previous?: FleetStatusSnapshot,
): TemporalContext {
  if (!previous) {
    return { trend: 'stable', daysTracked: 1 };
  }

  const deltaPercentOnline = current.percentOnline - previous.percentOnline;

  // Find newly online devices (were offline, now not)
  const currentOfflineSet = new Set(current.offlineLoggers);
  const previousOfflineSet = new Set(previous.offlineLoggers);

  const newlyOnline = previous.offlineLoggers.filter(
    (id) => !currentOfflineSet.has(id),
  );
  const newlyOffline = current.offlineLoggers.filter(
    (id) => !previousOfflineSet.has(id),
  );

  // Determine trend based on delta
  let trend: 'improving' | 'stable' | 'declining';
  if (deltaPercentOnline > 2) {
    trend = 'improving';
  } else if (deltaPercentOnline < -2) {
    trend = 'declining';
  } else {
    trend = 'stable';
  }

  return {
    previousStatus: previous,
    deltaPercentOnline,
    newlyOnline: newlyOnline.length > 0 ? newlyOnline : undefined,
    newlyOffline: newlyOffline.length > 0 ? newlyOffline : undefined,
    trend,
    daysTracked: 2,
  };
}

/**
 * Generate human-readable delta phrase for narrative.
 * Returns undefined if delta is insignificant (< 1%).
 *
 * @param temporal - Temporal context with delta
 * @returns Delta phrase like "up 5% from yesterday" or undefined
 */
export function generateDeltaPhrase(
  temporal: TemporalContext,
): string | undefined {
  if (
    temporal.deltaPercentOnline === undefined ||
    Math.abs(temporal.deltaPercentOnline) < 1
  ) {
    return undefined;
  }

  const absChange = Math.abs(temporal.deltaPercentOnline).toFixed(0);

  if (temporal.deltaPercentOnline > 0) {
    return `up ${absChange}% from yesterday`;
  } else {
    return `down ${absChange}% from yesterday`;
  }
}
