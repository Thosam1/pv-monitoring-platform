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
 * Argument type for flow-specific requirements.
 */
export type FlowArgumentType =
  | 'single_logger'
  | 'multiple_loggers'
  | 'date'
  | 'date_range';

/**
 * Default strategy for optional arguments.
 */
export type DefaultStrategy =
  | 'last_7_days'
  | 'latest_date'
  | 'all_loggers'
  | 'none';

/**
 * Logger type pattern for filtering.
 */
export type LoggerTypePattern = 'inverter' | 'meteo' | 'all';

/**
 * Flow-specific argument requirements definition.
 * Used to validate and prompt for missing arguments.
 */
export interface FlowArgumentSpec {
  /** Name of the argument (e.g., 'loggerId', 'dateRange') */
  name: string;
  /** Whether this argument is required to proceed */
  required: boolean;
  /** Type of argument for validation and UI rendering */
  type: FlowArgumentType;
  /** Minimum count for array types (e.g., 2 for comparison) */
  minCount?: number;
  /** Maximum count for array types */
  maxCount?: number;
  /** Default value strategy for optional arguments */
  defaultStrategy?: DefaultStrategy;
  /** Human-readable description for prompts */
  description?: string;
}

/**
 * Result of argument extraction from user message.
 * Populated by the router node during classification.
 */
export interface ExtractedArguments {
  /** Single logger ID if detected (e.g., "925") */
  loggerId?: string;
  /** Multiple logger IDs if detected (e.g., from "compare 925 and 926") */
  loggerIds?: string[];
  /** Logger name pattern (e.g., "the GoodWe", "meteo station") */
  loggerNamePattern?: string;
  /** Logger type pattern (e.g., "all inverters", "meteo stations") */
  loggerTypePattern?: LoggerTypePattern;
  /** Single date if detected (YYYY-MM-DD format) */
  date?: string;
  /** Date range if detected (from "last 7 days", "October 1 to 15") */
  dateRange?: { start: string; end: string };
  /** Confidence scores for each extraction (0-1) */
  confidence?: {
    loggerId?: number;
    date?: number;
    dateRange?: number;
  };
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
  /** Extended extracted arguments from router (for proactive prompting) */
  extractedArgs?: ExtractedArguments;
  /** Which argument we're currently prompting for */
  currentPromptArg?: string;
  /** Flow-specific argument requirements (for validation) */
  argumentSpec?: FlowArgumentSpec[];
  /** Flag indicating we're waiting for user input (prevents re-prompting) */
  waitingForUserInput?: boolean;
  /** Flag indicating no loggers are available (empty options case) */
  noLoggersAvailable?: boolean;
  /** User-configured electricity rate in €/kWh (for financial calculations) */
  electricityRate?: number;
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
 * Extended to support multiple loggers, date ranges, and type patterns.
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
  /**
   * If true, the user is providing a valid selection response (e.g., "925", "I selected: 925").
   * When true, selectedValue contains the selection and the flow should resume.
   * When false during waitingForUserInput, the user wants to cancel/change intent.
   */
  isSelectionResponse: z.boolean().optional().default(false),
  /**
   * The selected value(s) when isSelectionResponse is true.
   * - String for single selection (loggerId, date)
   * - Array for multiple selection (loggerIds)
   */
  selectedValue: z
    .union([z.string(), z.array(z.string()), z.null()])
    .optional(),
  extractedParams: z
    .object({
      /** Single logger ID (e.g., "925") */
      loggerId: z.string().nullable().optional(),
      /** Multiple logger IDs for comparison (e.g., ["925", "926"]) */
      loggerIds: z.array(z.string()).nullable().optional(),
      /** Logger name pattern (e.g., "GoodWe", "meteo station") */
      loggerName: z.string().nullable().optional(),
      /** Logger type pattern for fleet queries */
      loggerTypePattern: z
        .enum(['inverter', 'meteo', 'all'])
        .nullable()
        .optional(),
      /** Single date (YYYY-MM-DD format) */
      date: z.string().nullable().optional(),
      /** Date range (from "last 7 days", "October 1 to 15") */
      dateRange: z
        .object({
          start: z.string(),
          end: z.string(),
        })
        .nullable()
        .optional(),
    })
    .nullable()
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

// ============================================================================
// Context Cleanup Utilities
// ============================================================================

/**
 * Fields that should be preserved across flow switches.
 * These are session-level settings that apply regardless of which flow is active.
 */
const PERSISTENT_CONTEXT_FIELDS = [
  'narrativePreferences',
  'previousFleetStatus',
  'userTimezone',
  'electricityRate',
] as const;

/**
 * Fields that are flow-specific and must be cleared on switch.
 * These accumulate during a single flow execution and should not leak between flows.
 */
export const FLOW_SPECIFIC_FIELDS = [
  'selectedLoggerId',
  'selectedLoggerIds',
  'selectedDate',
  'dateRange',
  'toolResults',
  'extractedLoggerName',
  'analyzeAllLoggers',
  'extractedArgs',
  'currentPromptArg',
  'argumentSpec',
  'waitingForUserInput',
  'noLoggersAvailable',
] as const;

/**
 * Create a clean flow context, preserving only session-level settings.
 * Call this when switching flows to prevent state pollution.
 *
 * @param currentContext - The current flow context to clean
 * @returns A new FlowContext with only persistent fields preserved
 *
 * @example
 * // In router.node.ts when switching flows:
 * return {
 *   activeFlow: classification.flow,
 *   flowContext: createCleanFlowContext(state.flowContext),
 * };
 */
export function createCleanFlowContext(
  currentContext: FlowContext,
): FlowContext {
  const cleanContext: FlowContext = {};

  // Only preserve session-level settings
  for (const field of PERSISTENT_CONTEXT_FIELDS) {
    if (currentContext[field] !== undefined) {
      (cleanContext as Record<string, unknown>)[field] = currentContext[field];
    }
  }

  return cleanContext;
}
