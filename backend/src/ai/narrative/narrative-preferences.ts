/**
 * User preferences for narrative generation.
 * Stored in FlowContext and persisted for session duration.
 */

/**
 * Communication style for narrative output.
 */
export type NarrativeTone = 'casual' | 'professional' | 'technical';

/**
 * Detail level for narrative output.
 */
export type NarrativeVerbosity = 'brief' | 'standard' | 'detailed';

/**
 * Assistant personality for narrative output.
 */
export type NarrativePersona = 'advisor' | 'analyst' | 'helper';

/**
 * User preferences for narrative generation.
 */
export interface NarrativePreferences {
  /**
   * Communication style:
   * - 'casual': Friendly, uses contractions, occasional encouragement
   * - 'professional': Clear, measured, factual without being cold
   * - 'technical': Includes specific numbers, technical terms for experts
   */
  tone: NarrativeTone;

  /**
   * Detail level:
   * - 'brief': 1-2 sentences, headline style
   * - 'standard': 2-3 sentences, balanced context
   * - 'detailed': 3-5 sentences, full context and implications
   */
  verbosity: NarrativeVerbosity;

  /**
   * Assistant personality:
   * - 'advisor': Proactive recommendations, guidance-focused
   * - 'analyst': Data-driven, comparison-focused
   * - 'helper': Task-oriented, action-focused
   */
  persona: NarrativePersona;
}

/**
 * Default preferences for new sessions.
 * Casual tone with standard verbosity suits most PV plant owners.
 */
export const DEFAULT_NARRATIVE_PREFERENCES: NarrativePreferences = {
  tone: 'casual',
  verbosity: 'standard',
  persona: 'advisor',
};

/**
 * Word count targets for each verbosity level.
 */
export const VERBOSITY_WORD_TARGETS: Record<
  NarrativeVerbosity,
  { min: number; max: number }
> = {
  brief: { min: 15, max: 40 },
  standard: { min: 30, max: 70 },
  detailed: { min: 60, max: 120 },
};

/**
 * Check if narrative length matches verbosity preference.
 */
export function matchesVerbosity(
  narrative: string,
  verbosity: NarrativeVerbosity,
): boolean {
  const wordCount = narrative.split(/\s+/).length;
  const target = VERBOSITY_WORD_TARGETS[verbosity];
  return wordCount >= target.min && wordCount <= target.max;
}
