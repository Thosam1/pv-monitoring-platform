import { Logger } from '@nestjs/common';
import { AIMessage, BaseMessage } from '@langchain/core/messages';
import { isHumanMessage } from '../utils/message-utils';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import {
  ExplicitFlowState,
  FlowContext,
  FlowArgumentSpec,
  FlowType,
  createCleanFlowContext,
} from '../types/flow-state';
import { getFlowArgumentSpec } from '../flows/flow-argument-specs';
import {
  generateToolCallId,
  formatLoggerOptions,
  getDateDaysAgo,
  getLatestDateString,
  resolveLoggersByPattern,
  createEnhancedSelectionArgs,
  getOverallDataRange,
  LoggerInfo,
} from '../flows/flow-utils';
import { NarrativeEngine, RequestPromptContext } from '../narrative';

/**
 * Supported model types for prompt generation.
 */
type ModelType =
  | ChatGoogleGenerativeAI
  | ChatAnthropic
  | ChatOpenAI
  | ChatOllama;

const logger = new Logger('ArgumentCheckNode');

/**
 * Extract the last user message from the conversation.
 * Used for intent detection in free_chat dynamic spec injection.
 */
function getLastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (isHumanMessage(messages[i])) {
      const content = messages[i].content;
      return typeof content === 'string' ? content : '';
    }
  }
  return '';
}

/**
 * Result of argument check indicating whether to proceed or wait.
 */
export type ArgumentCheckResult = 'proceed' | 'wait';

/**
 * Apply default value for a missing optional argument.
 *
 * @param spec - The argument specification
 * @param context - Current flow context
 * @returns Object with applied value and flag indicating if default was used
 */
function applyDefault(
  spec: FlowArgumentSpec,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  context: FlowContext,
): { value: unknown; wasApplied: boolean } {
  if (!spec.defaultStrategy || spec.defaultStrategy === 'none') {
    return { value: undefined, wasApplied: false };
  }

  switch (spec.defaultStrategy) {
    case 'last_7_days':
      return {
        value: { start: getDateDaysAgo(7), end: getLatestDateString() },
        wasApplied: true,
      };
    case 'latest_date':
      return { value: getLatestDateString(), wasApplied: true };
    case 'all_loggers':
      // This needs to be resolved with available loggers list
      return { value: undefined, wasApplied: false };
    default:
      return { value: undefined, wasApplied: false };
  }
}

/**
 * Check if an argument is satisfied in the current context.
 *
 * @param spec - The argument specification
 * @param context - Current flow context
 * @returns True if the argument requirement is satisfied
 */
function isArgumentSatisfied(
  spec: FlowArgumentSpec,
  context: FlowContext,
): boolean {
  switch (spec.name) {
    case 'loggerId':
      return !!context.selectedLoggerId;
    case 'loggerIds':
      return (context.selectedLoggerIds?.length || 0) >= (spec.minCount || 1);
    case 'date':
      return !!context.selectedDate;
    case 'dateRange':
      return !!context.dateRange;
    default:
      return false;
  }
}

/**
 * Resolve pre-selected values from pattern matching.
 * Extracted to a separate function for clarity.
 */
function resolvePreSelectedValues(
  spec: FlowArgumentSpec,
  context: FlowContext,
  availableLoggers: LoggerInfo[],
): string[] {
  const extractedArgs = context.extractedArgs || {};

  if (spec.name === 'loggerId') {
    if (context.extractedLoggerName || extractedArgs.loggerTypePattern) {
      const resolved = resolveLoggersByPattern(
        context.extractedLoggerName,
        extractedArgs.loggerTypePattern,
        availableLoggers,
      );
      return resolved.length > 0 ? resolved.slice(0, 1) : [];
    }
  }

  if (spec.name === 'loggerIds') {
    if (context.selectedLoggerIds?.length) {
      return context.selectedLoggerIds;
    }
    if (extractedArgs.loggerIds?.length) {
      return extractedArgs.loggerIds;
    }
  }

  return [];
}

/**
 * Generate a persona-aware prompt for a missing argument using NarrativeEngine.
 * Falls back to static strings if LLM generation fails.
 *
 * @param spec - The argument specification
 * @param context - Current flow context
 * @param availableLoggers - List of available loggers
 * @param flowType - The active flow type
 * @param model - LLM model for prompt generation
 * @returns Prompt configuration with context message and pre-selections
 */
async function generateContextAwarePrompt(
  spec: FlowArgumentSpec,
  context: FlowContext,
  availableLoggers: LoggerInfo[],
  flowType: string,
  model: ModelType,
): Promise<{
  prompt: string;
  contextMessage?: string;
  preSelectedValues?: string[];
}> {
  // First, resolve any pre-selected values from pattern matching
  const preSelectedValues = resolvePreSelectedValues(
    spec,
    context,
    availableLoggers,
  );

  // Build context for NarrativeEngine
  const requestContext: RequestPromptContext = {
    flowType: flowType as FlowType,
    extractedInfo: {
      loggerName: context.extractedLoggerName,
      loggerType: context.extractedArgs?.loggerTypePattern,
    },
    optionCount: availableLoggers.length,
    preSelectedValues:
      preSelectedValues.length > 0 ? preSelectedValues : undefined,
  };

  // Generate prompt using NarrativeEngine
  const narrativeEngine = new NarrativeEngine(model);
  const result = await narrativeEngine.generateRequestPrompt(
    spec,
    requestContext,
    availableLoggers,
  );

  return {
    prompt: result.prompt,
    contextMessage: result.contextMessage,
    preSelectedValues:
      preSelectedValues.length > 0 ? preSelectedValues : undefined,
  };
}

/**
 * Intent keyword patterns for dynamic spec injection in free_chat.
 * Each entry maps keywords to the appropriate argument specification.
 */
const FREE_CHAT_INTENT_SPECS: Array<{
  keywords: string[];
  spec: FlowArgumentSpec[];
  logDescription: string;
}> = [
  {
    keywords: ['power curve', 'production', 'power output'],
    spec: [{ name: 'loggerId', required: true, type: 'single_logger' }],
    logDescription: 'power curve',
  },
  {
    keywords: ['savings', 'money', 'financial'],
    spec: [{ name: 'loggerId', required: true, type: 'single_logger' }],
    logDescription: 'savings',
  },
  {
    keywords: ['compare', 'all loggers', 'fleet'],
    spec: [
      {
        name: 'loggerIds',
        required: true,
        type: 'multiple_loggers',
        minCount: 2,
        maxCount: 5,
      },
    ],
    logDescription: 'comparison',
  },
  {
    keywords: ['health', 'error', 'diagnose'],
    spec: [{ name: 'loggerId', required: true, type: 'single_logger' }],
    logDescription: 'health check',
  },
];

/** Single-logger flows that cannot handle multi-select */
const SINGLE_LOGGER_FLOWS = ['health_check', 'financial_report'];

/**
 * Detect intent from message and return appropriate specs for free_chat.
 * Returns empty array if no intent is detected.
 */
function detectFreeChatIntentSpecs(message: string): FlowArgumentSpec[] {
  const lowerMessage = message.toLowerCase();

  for (const intent of FREE_CHAT_INTENT_SPECS) {
    if (intent.keywords.some((kw) => lowerMessage.includes(kw))) {
      logger.debug(
        `[ARG CHECK] Injected spec for ${intent.logDescription} in free_chat`,
      );
      return intent.spec;
    }
  }

  return [];
}

/**
 * Handle cardinality mismatch - auto-switch to performance_audit when
 * multiple loggers are selected for a single-logger flow.
 */
function handleCardinalityMismatch(
  state: ExplicitFlowState,
  selectedCount: number,
  flowType: string,
  model: ModelType,
): Partial<ExplicitFlowState> | null {
  if (selectedCount <= 1 || !SINGLE_LOGGER_FLOWS.includes(flowType)) {
    return null;
  }

  logger.log(
    `[ARG CHECK] Auto-switching to performance_audit: ${selectedCount} loggers selected for ${flowType}`,
  );

  const narrativeEngine = new NarrativeEngine(model);
  const acknowledgment = narrativeEngine.generateTransitionMessage(
    flowType,
    'performance_audit',
    { reason: 'auto_switch', selectedCount },
  );

  return {
    messages: acknowledgment
      ? [new AIMessage({ content: acknowledgment })]
      : [],
    activeFlow: 'performance_audit',
    flowStep: 0,
    flowContext: {
      ...createCleanFlowContext(state.flowContext),
      selectedLoggerIds: state.flowContext.selectedLoggerIds,
    },
  };
}

/**
 * Apply default values to context for optional arguments.
 */
function applyDefaultsToContext(
  specs: FlowArgumentSpec[],
  context: FlowContext,
): { updatedContext: FlowContext; appliedDefaults: string[] } {
  let updatedContext = { ...context };
  const appliedDefaults: string[] = [];

  for (const spec of specs) {
    if (!spec.required && !isArgumentSatisfied(spec, updatedContext)) {
      const { value, wasApplied } = applyDefault(spec, updatedContext);
      if (wasApplied && value !== undefined) {
        appliedDefaults.push(spec.name);
        if (spec.name === 'dateRange') {
          updatedContext = {
            ...updatedContext,
            dateRange: value as { start: string; end: string },
          };
        } else if (spec.name === 'date') {
          updatedContext = {
            ...updatedContext,
            selectedDate: value as string,
          };
        }
      }
    }
  }

  return { updatedContext, appliedDefaults };
}

/**
 * Build selection args for logger selection prompts.
 */
function buildLoggerSelectionArgs(
  spec: FlowArgumentSpec,
  prompt: string,
  contextMessage: string | undefined,
  availableLoggers: LoggerInfo[],
  preSelectedValues: string[] | undefined,
): Record<string, unknown> | null {
  const options = formatLoggerOptions({ loggers: availableLoggers });

  if (options.length === 0) {
    return null; // No loggers available
  }

  return createEnhancedSelectionArgs({
    prompt,
    contextMessage,
    options,
    selectionType: spec.type === 'multiple_loggers' ? 'multiple' : 'single',
    inputType: 'dropdown',
    preSelectedValues,
    minCount: spec.type === 'multiple_loggers' ? spec.minCount : undefined,
    maxCount: spec.type === 'multiple_loggers' ? spec.maxCount : undefined,
    flowHint: {
      expectedNext: spec.description || 'Continue with analysis',
      skipOption:
        spec.type === 'multiple_loggers'
          ? {
              label: 'Compare top 3',
              action: 'Automatically select the 3 loggers with most data',
            }
          : undefined,
    },
  });
}

/**
 * Build selection args for date selection prompts.
 */
function buildDateSelectionArgs(
  spec: FlowArgumentSpec,
  prompt: string,
  contextMessage: string | undefined,
  availableLoggers: LoggerInfo[],
): Record<string, unknown> {
  const dataRange = getOverallDataRange(availableLoggers);
  return createEnhancedSelectionArgs({
    prompt,
    contextMessage,
    options: [],
    selectionType: 'single',
    inputType: spec.type === 'date_range' ? 'date-range' : 'date',
    minDate: dataRange?.start,
    maxDate: dataRange?.end,
    flowHint: {
      expectedNext: spec.description || 'Continue with analysis',
    },
  });
}

/**
 * Build response for when no loggers are available.
 */
function buildNoLoggersResponse(
  state: ExplicitFlowState,
  updatedContext: FlowContext,
): Partial<ExplicitFlowState> {
  logger.debug(
    'No loggers available for selection, returning helpful error message',
  );

  const errorMessage = new AIMessage({
    content: `I'd love to help with that! However, I don't see any loggers connected to your system yet.

**To get started:**
1. Go to the **Upload** section in the dashboard
2. Upload data from your solar inverter or monitoring system
3. Come back and ask me again!

Once you have data, I can help with financial reports, health checks, performance comparisons, and more.`,
  });

  return {
    messages: [errorMessage],
    flowStep: state.flowStep,
    flowContext: {
      ...updatedContext,
      noLoggersAvailable: true,
    },
  };
}

/**
 * Build response for missing required argument with prompt.
 */
function buildMissingArgResponse(
  state: ExplicitFlowState,
  spec: FlowArgumentSpec,
  specs: FlowArgumentSpec[],
  selectionArgs: Record<string, unknown>,
  prompt: string,
  contextMessage: string | undefined,
  updatedContext: FlowContext,
): Partial<ExplicitFlowState> {
  const toolCallId = generateToolCallId();

  const messageContent = contextMessage
    ? `${contextMessage}\n\n${prompt}`
    : prompt;

  // Encode flow context as hidden metadata
  const flowMetadata = JSON.stringify({
    __flowContext: {
      activeFlow: state.activeFlow,
      currentPromptArg: spec.name,
      waitingForUserInput: true,
      extractedArgs: updatedContext.extractedArgs,
    },
  });

  const aiMessage = new AIMessage({
    content: `${messageContent}\n\n<!-- ${flowMetadata} -->`,
    tool_calls: [
      {
        id: toolCallId,
        name: 'request_user_selection',
        args: selectionArgs,
      },
    ],
  });

  return {
    messages: [aiMessage],
    flowStep: 0,
    flowContext: {
      ...updatedContext,
      currentPromptArg: spec.name,
      argumentSpec: specs,
      waitingForUserInput: true,
    },
    pendingUiActions: [
      {
        toolCallId,
        toolName: 'request_user_selection',
        args: selectionArgs,
      },
    ],
  };
}

/**
 * Argument Check Node - validates required arguments and generates context-aware prompts.
 *
 * This reusable node:
 * 1. Resolves logger patterns to actual IDs
 * 2. Applies defaults for optional arguments
 * 3. Checks if all required arguments are satisfied
 * 4. Generates persona-aware prompts using NarrativeEngine for missing args
 *
 * @param state - Current flow state
 * @param availableLoggers - List of available loggers with their metadata
 * @param model - LLM model for generating persona-aware prompts
 * @returns Partial state update (proceed if satisfied, or prompt if missing)
 */
export async function argumentCheckNode(
  state: ExplicitFlowState,
  availableLoggers: LoggerInfo[],
  model: ModelType,
): Promise<Partial<ExplicitFlowState>> {
  const flowType = state.activeFlow;
  if (!flowType) {
    logger.warn('No active flow, skipping argument check');
    return {};
  }

  // Check for cardinality mismatch (multi-select on single-logger flow)
  const selectedCount = (state.flowContext.selectedLoggerIds || []).length;
  const cardinalityResult = handleCardinalityMismatch(
    state,
    selectedCount,
    flowType,
    model,
  );
  if (cardinalityResult) {
    return cardinalityResult;
  }

  // Check if already waiting for user input to prevent recursion
  if (state.flowContext.waitingForUserInput) {
    logger.debug(
      `Argument check: Already waiting for user input (arg: ${state.flowContext.currentPromptArg}), preserving state`,
    );
    return {
      flowContext: state.flowContext,
      pendingUiActions: state.pendingUiActions,
    };
  }

  // Get argument specs for this flow
  let specs = getFlowArgumentSpec(flowType);

  // Dynamic spec injection for free_chat based on intent keywords
  if (flowType === 'free_chat' && specs.length === 0) {
    const lastMsg = getLastUserMessage(state.messages);
    const detectedSpecs = detectFreeChatIntentSpecs(lastMsg);
    if (detectedSpecs.length > 0) {
      specs = detectedSpecs;
    }
  }

  if (specs.length === 0) {
    logger.debug(`Flow ${flowType} has no argument requirements`);
    return { flowStep: 1 };
  }

  logger.debug(`Checking arguments for flow: ${flowType}`);

  // Apply defaults for optional missing args
  const { updatedContext, appliedDefaults } = applyDefaultsToContext(
    specs,
    state.flowContext,
  );

  if (appliedDefaults.length > 0) {
    logger.debug(`Applied defaults for: ${appliedDefaults.join(', ')}`);
  }

  // Find first missing required argument
  const missingArg = specs.find(
    (spec) => spec.required && !isArgumentSatisfied(spec, updatedContext),
  );

  if (!missingArg) {
    logger.debug('All required arguments satisfied, proceeding with flow');
    return { flowStep: 1, flowContext: updatedContext };
  }

  // Generate prompt for missing argument
  logger.debug(`Missing required argument: ${missingArg.name}`);
  const { prompt, contextMessage, preSelectedValues } =
    await generateContextAwarePrompt(
      missingArg,
      updatedContext,
      availableLoggers,
      flowType,
      model,
    );

  // Build selection args based on argument type
  const isLoggerArg =
    missingArg.type === 'single_logger' ||
    missingArg.type === 'multiple_loggers';

  if (isLoggerArg) {
    const selectionArgs = buildLoggerSelectionArgs(
      missingArg,
      prompt,
      contextMessage,
      availableLoggers,
      preSelectedValues,
    );

    if (!selectionArgs) {
      return buildNoLoggersResponse(state, updatedContext);
    }

    return buildMissingArgResponse(
      state,
      missingArg,
      specs,
      selectionArgs,
      prompt,
      contextMessage,
      updatedContext,
    );
  }

  // Date or date range selection
  const selectionArgs = buildDateSelectionArgs(
    missingArg,
    prompt,
    contextMessage,
    availableLoggers,
  );

  return buildMissingArgResponse(
    state,
    missingArg,
    specs,
    selectionArgs,
    prompt,
    contextMessage,
    updatedContext,
  );
}

/**
 * Routing function for conditional edges after argument check.
 * Returns 'proceed' if all required args are satisfied, 'wait' otherwise.
 *
 * @param state - Current flow state
 * @returns 'proceed' to continue flow or 'wait' to pause for user input
 */
export function hasRequiredArgs(state: ExplicitFlowState): ArgumentCheckResult {
  const flowType = state.activeFlow;
  if (!flowType) return 'proceed';

  const specs = getFlowArgumentSpec(flowType);
  const requiredSpecs = specs.filter((s) => s.required);

  for (const spec of requiredSpecs) {
    if (!isArgumentSatisfied(spec, state.flowContext)) {
      return 'wait';
    }
  }

  return 'proceed';
}
