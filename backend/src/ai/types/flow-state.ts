import { Annotation, MessagesAnnotation } from '@langchain/langgraph';
import { z } from 'zod';
import { NarrativePreferences } from '../narrative/narrative-preferences';

/**
 * Flow type enumeration for explicit workflow routing.
 */
export type FlowType =
  | 'morning_briefing'
  | 'financial_report'
  | 'performance_audit'
  | 'health_check'
  | 'free_chat'
  | 'greeting';

/**
 * Snapshot of fleet status for temporal comparison.
 * Stored between flow executions for delta calculations.
 * Used by morning briefing to enable "compared to yesterday" narratives.
 */
export interface FleetStatusSnapshot {
  /** ISO timestamp when snapshot was taken */
  timestamp: string;
  /** Percentage of devices online (0-100) */
  percentOnline: number;
  /** Total power in watts */
  totalPower: number;
  /** Total energy in kWh */
  totalEnergy: number;
  /** List of offline logger IDs */
  offlineLoggers: string[];
  /** Average health score across fleet (0-100) */
  healthScore: number;
}

/**
 * Context accumulated during flow execution.
 * This carries user selections and intermediate results between flow steps.
 */
export interface FlowContext {
  /** Single selected logger ID */
  selectedLoggerId?: string;
  /** Multiple selected logger IDs (for comparison flows) */
  selectedLoggerIds?: string[];
  /** Selected single date */
  selectedDate?: string;
  /** Selected date range */
  dateRange?: { start: string; end: string };
  /** Tool results from previous steps, keyed by tool name */
  toolResults?: Record<string, unknown>;
  /** Logger name if extracted from user message */
  extractedLoggerName?: string;
  /** Flag to analyze all loggers (for "all devices" intent) */
  analyzeAllLoggers?: boolean;
  /** User preferences for narrative generation (session-level) */
  narrativePreferences?: NarrativePreferences;
  /** Metadata from last narrative generation (for debugging/analytics) */
  lastNarrativeMetadata?: {
    branchPath: string;
    wasRefined: boolean;
    generationTimeMs: number;
  };
  /** Previous fleet status for temporal comparison (morning briefing) */
  previousFleetStatus?: FleetStatusSnapshot;
  /** User's timezone for time-aware greetings (IANA format, e.g., "America/New_York") */
  userTimezone?: string;
}

/**
 * Pending UI action for pass-through tools.
 */
export interface PendingUiAction {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

/**
 * Suggestion item for contextual follow-up actions.
 * Legacy interface for backward compatibility.
 */
export interface SuggestionItem {
  /** Display label for the suggestion chip */
  label: string;
  /** Natural language action to execute when clicked */
  action: string;
  /** Visual prominence */
  priority: 'primary' | 'secondary';
}

/**
 * Priority levels for enhanced suggestions with visual badges.
 */
export type EnhancedPriority =
  | 'urgent' // Red badge [!] - requires immediate attention
  | 'recommended' // Amber badge [*] - should do soon
  | 'suggested' // Blue badge [>] - nice to have
  | 'optional'; // No badge - for exploration

/**
 * Icon types for enhanced suggestions.
 */
export type SuggestionIcon =
  | 'alert' // Warning/error related
  | 'lightbulb' // Insights/forecasting
  | 'chart' // Visualization/analysis
  | 'settings' // Configuration/diagnostics
  | 'dollar'; // Financial

/**
 * Badge characters for visual priority indicators.
 */
export type PriorityBadge = '!' | '*' | '>' | null;

/**
 * Enhanced suggestion with priority badges and contextual reasons.
 * Extends the basic SuggestionItem with richer UX features.
 */
export interface EnhancedSuggestion {
  /** Display label for the suggestion chip */
  label: string;
  /** Natural language action to execute when clicked */
  action: string;
  /** Priority level determining visual style and sort order */
  priority: EnhancedPriority;
  /** Contextual explanation for why this is suggested */
  reason?: string;
  /** Visual badge character for the priority */
  badge?: PriorityBadge;
  /** Icon hint for frontend rendering */
  icon?: SuggestionIcon;
  /** Tool hint for programmatic use */
  toolHint?: string;
  /** Pre-filled parameters if the suggestion triggers a specific tool */
  params?: Record<string, unknown>;
}

/**
 * Union type for flexibility - supports both legacy and enhanced suggestions.
 */
export type AnySuggestion = SuggestionItem | EnhancedSuggestion;

/**
 * Type guard to check if a suggestion is enhanced.
 */
export function isEnhancedSuggestion(
  suggestion: AnySuggestion,
): suggestion is EnhancedSuggestion {
  return (
    'priority' in suggestion &&
    ['urgent', 'recommended', 'suggested', 'optional'].includes(
      suggestion.priority,
    )
  );
}

/**
 * Convert legacy priority to enhanced priority.
 */
export function normalizeToEnhancedPriority(
  priority: SuggestionItem['priority'] | EnhancedPriority,
): EnhancedPriority {
  if (priority === 'primary') return 'recommended';
  if (priority === 'secondary') return 'suggested';
  return priority;
}

/**
 * Map priority to badge character.
 */
export function priorityToBadge(priority: EnhancedPriority): PriorityBadge {
  const badgeMap: Record<EnhancedPriority, PriorityBadge> = {
    urgent: '!',
    recommended: '*',
    suggested: '>',
    optional: null,
  };
  return badgeMap[priority];
}

/**
 * Flow hint for request_user_selection tool.
 */
export interface FlowHint {
  /** Description of what will happen after selection */
  expectedNext: string;
  /** Optional skip option for users who want to use defaults */
  skipOption?: {
    label: string;
    action: string;
  };
}

/**
 * Extended state annotation for explicit flow-based chat processing.
 *
 * This extends the base MessagesAnnotation with:
 * - Recovery tracking (prevents infinite tool retry loops)
 * - Pending UI actions (pass-through tools for frontend)
 * - Active flow tracking (which workflow is executing)
 * - Flow step tracking (current position in workflow)
 * - Flow context (accumulated selections and results)
 */
export const ExplicitFlowStateAnnotation = Annotation.Root({
  // Inherit message history from LangGraph
  ...MessagesAnnotation.spec,

  // Track recovery attempts to prevent infinite loops
  recoveryAttempts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Track pending UI actions for pass-through tools
  pendingUiActions: Annotation<PendingUiAction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // NEW: Active workflow identifier (null for free chat)
  activeFlow: Annotation<FlowType | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // NEW: Current step within the active flow
  flowStep: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // NEW: Accumulated context (selections, dates, intermediate results)
  flowContext: Annotation<FlowContext>({
    reducer: (curr, next) => ({ ...curr, ...next }),
    default: () => ({}),
  }),
});

/**
 * Type alias for the explicit flow state.
 */
export type ExplicitFlowState = typeof ExplicitFlowStateAnnotation.State;

/**
 * Zod schema for LLM-based flow classification.
 */
export const FlowClassificationSchema = z.object({
  flow: z.enum([
    'morning_briefing',
    'financial_report',
    'performance_audit',
    'health_check',
    'free_chat',
    'greeting',
  ]),
  confidence: z.number().min(0).max(1),
  /** If true, the user is responding to a selection prompt (not a new question) */
  isContinuation: z.boolean().optional(),
  extractedParams: z
    .object({
      loggerId: z.string().optional(),
      loggerName: z.string().optional(),
      date: z.string().optional(),
    })
    .optional(),
});

/**
 * Type for the classification result.
 */
export type FlowClassification = z.infer<typeof FlowClassificationSchema>;

/**
 * Tool response status codes for recovery handling.
 */
export type ToolStatus =
  | 'ok'
  | 'success'
  | 'no_data'
  | 'no_data_in_window'
  | 'error';

/**
 * Standard tool response shape with status.
 */
export interface ToolResponse<T = unknown> {
  status: ToolStatus;
  result?: T;
  message?: string;
  availableRange?: {
    start: string;
    end: string;
  };
}

/**
 * Check if a tool response indicates a recoverable error.
 */
export function isRecoverableError(response: ToolResponse): boolean {
  return (
    response.status === 'no_data_in_window' || response.status === 'no_data'
  );
}

/**
 * Check if a tool response indicates success.
 */
export function isSuccessResponse(response: ToolResponse): boolean {
  return response.status === 'ok' || response.status === 'success';
}
