/**
 * Branching logic for narrative generation.
 * Replaces binary hasAnomalies with 10 nuanced branches.
 */

import {
  NarrativeContext,
  extractAnomalies,
  extractHealthScore,
  countBySeverity,
} from './narrative-context';

/**
 * Narrative branches for different scenarios.
 * Each branch determines the tone and structure of the narrative.
 */
export type NarrativeBranch =
  | 'healthy_all_clear' // No issues, excellent performance
  | 'healthy_minor_notes' // No anomalies but some observations
  | 'warning_single_anomaly' // One anomaly detected
  | 'warning_multiple_anomalies' // Multiple anomalies (2-3)
  | 'critical_high_severity' // High severity issues
  | 'critical_fleet_wide' // Multiple devices affected
  | 'data_incomplete' // Missing or partial data
  | 'data_stale' // Data from unexpected window
  | 'recurrent_issue' // Same problem seen before
  | 'trend_degrading' // Performance trending down
  | 'comparison_consistent' // < 10% spread - consistent performance
  | 'comparison_moderate' // 10-30% spread - noticeable variation
  | 'comparison_significant'; // > 30% spread - significant gap

/**
 * Branch priority order for selection (documentation only).
 * Higher priority branches are checked first in selectBranch():
 * 1. data_incomplete, data_stale (data quality)
 * 2. recurrent_issue, trend_degrading (historical patterns)
 * 3. critical_high_severity, critical_fleet_wide (critical issues)
 * 4. warning_multiple_anomalies, warning_single_anomaly (warnings)
 * 5. healthy_minor_notes, healthy_all_clear (healthy states)
 */

/**
 * Select the appropriate narrative branch based on context.
 * Uses priority-ordered evaluation to select the most relevant branch.
 *
 * @param context - Rich context from flow execution
 * @returns The selected narrative branch
 */
export function selectBranch(context: NarrativeContext): NarrativeBranch {
  const { dataQuality, historicalContext, data, isFleetAnalysis, fleetSize } =
    context;

  const anomalies = extractAnomalies(data);
  const healthScore = extractHealthScore(data);
  const severityCounts = countBySeverity(anomalies);

  // Data quality checks (highest priority)
  if (dataQuality.completeness < 50) {
    return 'data_incomplete';
  }

  if (!dataQuality.isExpectedWindow) {
    return 'data_stale';
  }

  // Performance audit comparison branches (flow-specific)
  // Check before other branches since comparison has its own severity logic
  if (context.flowType === 'performance_audit') {
    const severity = data.comparisonSeverity as
      | 'similar'
      | 'moderate_difference'
      | 'large_difference'
      | undefined;

    if (severity === 'similar') {
      return 'comparison_consistent';
    } else if (severity === 'moderate_difference') {
      return 'comparison_moderate';
    } else if (severity === 'large_difference') {
      return 'comparison_significant';
    }
    // Fall through to generic branches if no severity set
  }

  // Historical pattern detection
  if (historicalContext?.isRecurrent) {
    return 'recurrent_issue';
  }

  if (historicalContext?.trend === 'degrading') {
    return 'trend_degrading';
  }

  // Critical issues - high severity anomalies
  if (severityCounts.high > 0) {
    return 'critical_high_severity';
  }

  // Fleet-wide issues - multiple loggers affected
  if (isFleetAnalysis && fleetSize) {
    const loggersWithIssues = (data.loggersWithIssues as number) || 0;
    const affectedRatio = loggersWithIssues / fleetSize;
    if (affectedRatio > 0.3 && anomalies.length > 0) {
      return 'critical_fleet_wide';
    }
  }

  // Warning states - multiple anomalies
  if (anomalies.length > 3) {
    return 'warning_multiple_anomalies';
  }

  if (anomalies.length >= 1 && anomalies.length <= 3) {
    return severityCounts.medium > 0
      ? 'warning_multiple_anomalies'
      : 'warning_single_anomaly';
  }

  // Healthy states
  if (healthScore >= 95) {
    return 'healthy_all_clear';
  }

  // Minor observations - healthy but not perfect
  return 'healthy_minor_notes';
}

/**
 * Get the tone descriptor for a branch.
 * Used for prompt engineering and UI indicators.
 */
export function getBranchTone(
  branch: NarrativeBranch,
):
  | 'celebratory'
  | 'balanced'
  | 'advisory'
  | 'direct'
  | 'urgent'
  | 'explanatory'
  | 'analytical' {
  const toneMap: Record<NarrativeBranch, ReturnType<typeof getBranchTone>> = {
    healthy_all_clear: 'celebratory',
    healthy_minor_notes: 'balanced',
    warning_single_anomaly: 'advisory',
    warning_multiple_anomalies: 'direct',
    critical_high_severity: 'urgent',
    critical_fleet_wide: 'urgent',
    data_incomplete: 'explanatory',
    data_stale: 'explanatory',
    recurrent_issue: 'direct',
    trend_degrading: 'advisory',
    comparison_consistent: 'celebratory',
    comparison_moderate: 'analytical',
    comparison_significant: 'advisory',
  };
  return toneMap[branch];
}

/**
 * Check if branch indicates a problem requiring action.
 */
export function isActionRequired(branch: NarrativeBranch): boolean {
  const actionBranches: NarrativeBranch[] = [
    'critical_high_severity',
    'critical_fleet_wide',
    'warning_multiple_anomalies',
    'recurrent_issue',
    'trend_degrading',
    'comparison_significant', // Large differences require investigation
  ];
  return actionBranches.includes(branch);
}

/**
 * Check if branch is related to data quality issues.
 */
export function isDataQualityBranch(branch: NarrativeBranch): boolean {
  return branch === 'data_incomplete' || branch === 'data_stale';
}

/**
 * Get suggestion priority based on branch.
 */
export function getSuggestionPriority(
  branch: NarrativeBranch,
): 'urgent' | 'recommended' | 'suggested' | 'optional' {
  if (branch === 'critical_high_severity' || branch === 'critical_fleet_wide') {
    return 'urgent';
  }
  if (
    branch === 'warning_multiple_anomalies' ||
    branch === 'recurrent_issue' ||
    branch === 'trend_degrading' ||
    branch === 'comparison_significant'
  ) {
    return 'recommended';
  }
  if (
    branch === 'warning_single_anomaly' ||
    branch === 'data_incomplete' ||
    branch === 'data_stale' ||
    branch === 'comparison_moderate'
  ) {
    return 'suggested';
  }
  // comparison_consistent falls through to optional
  return 'optional';
}

// =============================================================================
// SEVERITY BANDS - Urgency-based tone adjustment
// =============================================================================

/**
 * Severity bands for urgency-based tone adjustment.
 * Used primarily for fleet status (percentOnline) and health scores.
 */
export type SeverityBand =
  | 'excellent' // 99%+ - celebrate!
  | 'good' // 95-98% - positive with minor note
  | 'attention' // 85-94% - balanced, informative
  | 'concern' // 70-84% - concerned but calm
  | 'urgent'; // <70% - direct, action-oriented

/**
 * Calculate severity band from percentage online.
 * Used for fleet status and operational metrics.
 *
 * @param percentOnline - Percentage of devices online (0-100)
 * @returns Severity band for tone adjustment
 */
export function calculateSeverityBand(percentOnline: number): SeverityBand {
  if (percentOnline >= 99) return 'excellent';
  if (percentOnline >= 95) return 'good';
  if (percentOnline >= 85) return 'attention';
  if (percentOnline >= 70) return 'concern';
  return 'urgent';
}

/**
 * Calculate severity band from health score.
 * Used for health check flows.
 *
 * @param healthScore - Health score (0-100)
 * @returns Severity band for tone adjustment
 */
export function calculateHealthSeverityBand(healthScore: number): SeverityBand {
  if (healthScore >= 98) return 'excellent';
  if (healthScore >= 90) return 'good';
  if (healthScore >= 75) return 'attention';
  if (healthScore >= 50) return 'concern';
  return 'urgent';
}

/**
 * Tone hints for each severity band.
 * These are injected into prompts to guide LLM tone.
 */
export const SEVERITY_TONE_HINTS: Record<SeverityBand, string> = {
  excellent: `TONE GUIDANCE: Celebratory and brief. The user can relax.
Lead with good news. Keep it short - no need to elaborate on perfection.
Example opener: "Great news - everything's running perfectly!"`,

  good: `TONE GUIDANCE: Positive with gentle acknowledgment.
Celebrate the success but briefly mention any minor observations.
Example opener: "Your system is performing well, with just a minor note..."`,

  attention: `TONE GUIDANCE: Balanced and informative. Acknowledge gaps without alarm.
Be matter-of-fact about what needs attention. Don't minimize but don't dramatize.
Example opener: "Your fleet is mostly healthy, though a few devices need attention."`,

  concern: `TONE GUIDANCE: Concerned but calm. Lead with the issue.
Be direct about the problem but maintain composure. Focus on next steps.
Example opener: "I need to flag something - several devices are offline today."`,

  urgent: `TONE GUIDANCE: Direct and action-oriented. This needs immediate attention.
Don't bury the lead. State the problem clearly and guide toward action.
Example opener: "Your fleet has a significant issue that needs attention right away."`,
};
