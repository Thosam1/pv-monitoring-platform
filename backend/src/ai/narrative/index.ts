/**
 * Narrative Module
 *
 * Centralized narrative generation for AI flows.
 * Replaces inline narrative generation with multi-step processing:
 * decompose → branch → generate → conditional refine
 *
 * Features:
 * - Agent identity (Sunny persona)
 * - Severity-based tone adjustment
 * - Temporal context for "compared to yesterday" narratives
 * - Enhanced fallback narratives
 *
 * @module narrative
 */

// Core engine
export { NarrativeEngine } from './narrative-engine';
export type {
  NarrativeResult,
  RequestPromptContext,
  RequestPromptResult,
} from './narrative-engine';

// Preferences
export {
  DEFAULT_NARRATIVE_PREFERENCES,
  VERBOSITY_WORD_TARGETS,
  matchesVerbosity,
} from './narrative-preferences';
export type {
  NarrativePreferences,
  NarrativeTone,
  NarrativeVerbosity,
  NarrativePersona,
} from './narrative-preferences';

// Context interfaces
export {
  extractAnomalies,
  extractHealthScore,
  countBySeverity,
  createDefaultDataQuality,
  buildTemporalContext,
  generateDeltaPhrase,
} from './narrative-context';
export type {
  NarrativeContext,
  DataQualityIndicators,
  HistoricalContext,
  AnomalyData,
  TemporalContext,
  CurrentFleetStatus,
} from './narrative-context';

// Branching logic
export {
  selectBranch,
  getBranchTone,
  isActionRequired,
  isDataQualityBranch,
  getSuggestionPriority,
  calculateSeverityBand,
  calculateHealthSeverityBand,
  SEVERITY_TONE_HINTS,
} from './narrative-branching';
export type { NarrativeBranch, SeverityBand } from './narrative-branching';

// Prompts (for testing/customization)
export {
  NARRATIVE_SYSTEM_PROMPT,
  BRANCH_PROMPTS,
  buildNarrativePrompt,
  buildRefinementPrompt,
  generateFallbackNarrative,
  REQUEST_PROMPT_SYSTEM,
  REQUEST_PROMPT_FALLBACKS,
  FORBIDDEN_TERMS,
} from './narrative-prompts';
export type { NarrativePromptOptions } from './narrative-prompts';

// Agent identity (for customization/testing)
export {
  AGENT_IDENTITY,
  STYLE_RULES,
  UNCERTAINTY_HANDLING,
  EXAMPLE_OUTPUTS,
  formatExamplesForBranch,
} from './narrative-identity';
