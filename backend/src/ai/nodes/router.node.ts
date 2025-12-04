import { Logger } from '@nestjs/common';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { isAiMessage, isHumanMessage } from '../utils/message-utils';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import {
  ExplicitFlowState,
  FlowClassification,
  FlowClassificationSchema,
  FlowContext,
  ExtractedArguments,
  FlowType,
  createCleanFlowContext,
} from '../types/flow-state';
import { NarrativeEngine } from '../narrative';

const logger = new Logger('RouterNode');

/**
 * Regex patterns for detecting simple greetings.
 * These are matched BEFORE LLM classification to provide instant responses.
 * Patterns use anchors to prevent false positives (e.g., "Hello, check my system").
 */
const GREETING_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|hiya|howdy|greetings)[\s!.,]*$/i,
  /^good\s+(morning|afternoon|evening|day)[\s!.,]*$/i,
  /^what('?s| is)\s+up[\s!?.,]*$/i,
  /^yo[\s!.,]*$/i,
  /^sup[\s!.,]*$/i,
  /^(hey|hi|hello)\s+there[\s!.,]*$/i,
  /^(hello|hi)\s+sunny[\s!.,]*$/i,
];

/**
 * Check if a message is a simple greeting.
 * Uses pattern matching to detect greetings without LLM call.
 * @param message - User message to check
 * @returns True if the message is a simple greeting
 */
export function isGreeting(message: string): boolean {
  const trimmed = message.trim();
  return GREETING_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Classification prompt for LLM-based intent detection.
 * Extended to extract date ranges, multiple loggers, and type patterns.
 */
const CLASSIFICATION_PROMPT = `You are a classification assistant for a solar monitoring platform. Analyze the user's message and classify their intent.

WORKFLOWS:
- morning_briefing: Fleet overview, site status, "how is everything", daily summary, "status report"
- financial_report: Savings, ROI, money, cost, revenue, financial analysis, "how much did I save"
- performance_audit: Compare inverters, efficiency comparison, "compare loggers", "which performs best"
- health_check: Anomalies, errors, health status, diagnostics, problems, "check health", "any issues"
- free_chat: General questions, specific data queries, single logger power curves, anything else

CLASSIFICATION RULES (apply in order - first match wins):
1. "power curve", "power output", "production chart" → free_chat (NOT morning_briefing)
2. "diagnose", "diagnose issues", "offline devices" → health_check (NOT morning_briefing)
3. "forecast", "predict", "projection" → free_chat
4. MULTIPLE loggers or COMPARE → performance_audit
5. Whole SITE or FLEET overview (generic status, NOT specific metrics) → morning_briefing
6. MONEY, SAVINGS, or COST → financial_report
7. ERRORS, ANOMALIES, or HEALTH → health_check
8. When in doubt → free_chat

EXTRACTION RULES:

1. LOGGER IDs:
   - Extract exact IDs like "925", "9250KHTU22BP0338"
   - For "logger 925" or "inverter ABC" → extract the ID part as loggerId
   - For "compare 925 and 926" or "check 925, 926, 927" → extract as loggerIds array
   - For "the GoodWe" or "meteo station" → extract as loggerName pattern
   - For "all inverters" → set loggerTypePattern to "inverter"
   - For "all meteo stations" → set loggerTypePattern to "meteo"
   - For "all devices" or "entire fleet" → set loggerTypePattern to "all"

2. DATES (convert to YYYY-MM-DD format):
   - "today" → today's date
   - "yesterday" → yesterday's date
   - "October 15" or "Oct 15" → current year date
   - "2025-01-15" → use as-is

3. DATE RANGES (set both start and end):
   - "last 7 days" → dateRange.start = 7 days ago, dateRange.end = today
   - "last week" → dateRange.start = 7 days ago, dateRange.end = today
   - "last month" → dateRange.start = 30 days ago, dateRange.end = today
   - "past 2 weeks" → dateRange.start = 14 days ago, dateRange.end = today
   - "from Jan 1 to Jan 15" → dateRange.start = 2025-01-01, dateRange.end = 2025-01-15
   - "between Oct 1 and Oct 10" → dateRange.start and end accordingly

4. SELECTION RESPONSES (set isContinuation=true):
   - Message is JUST an ID like "925" → user responding to logger selection
   - Message is JUST a date → user responding to date selection
   - "I selected: X" → extract X as appropriate parameter

RESPONSE FORMAT (JSON only, no markdown):
{
  "flow": "morning_briefing" | "financial_report" | "performance_audit" | "health_check" | "free_chat",
  "confidence": 0.0-1.0,
  "isContinuation": false,
  "isSelectionResponse": false,
  "selectedValue": null,
  "extractedParams": {
    "loggerId": "optional - single logger ID string",
    "loggerIds": ["optional - array for multiple loggers"],
    "loggerName": "optional - name pattern like 'GoodWe'",
    "loggerTypePattern": "inverter" | "meteo" | "all" | null,
    "date": "optional - YYYY-MM-DD",
    "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null
  }
}`;

/**
 * Context block injected into classification prompt when waiting for user selection.
 * Enables LLM to recognize valid selections vs intent changes.
 */
const WAITING_FOR_CONTEXT = `
PENDING SELECTION CONTEXT:
The assistant is waiting for the user to select: {{WAITING_FOR}}
Previous flow: {{ACTIVE_FLOW}}

SELECTION HANDLING RULES:
1. If user provides a VALID SELECTION for {{WAITING_FOR}}:
   - Set isSelectionResponse=true
   - Extract selectedValue (the ID, date, or values they selected)
   - Keep flow={{ACTIVE_FLOW}}
   - Examples: "925", "I selected: 925", "the first one", "925 and 926"

2. If user wants to CANCEL or CHANGE INTENT:
   - Phrases: "cancel", "never mind", "actually", "forget it", "different", "something else"
   - Set isSelectionResponse=false
   - Classify the NEW intent normally

3. If user asks for HELP:
   - Phrases: "help", "what are my options", "explain", "which one"
   - Set flow="free_chat", isSelectionResponse=false
`;

/**
 * Build the classification prompt, optionally injecting selection context.
 * When waiting for user input, adds WAITING_FOR_CONTEXT to help LLM
 * distinguish between valid selections and intent changes.
 *
 * @param waitingFor - The argument being waited for (e.g., 'loggerId', 'loggerIds')
 * @param activeFlow - The currently active flow
 * @returns The classification prompt with optional context injection
 */
function buildClassificationPrompt(
  waitingFor?: string,
  activeFlow?: FlowType,
): string {
  if (!waitingFor) return CLASSIFICATION_PROMPT;

  const contextBlock = WAITING_FOR_CONTEXT.replaceAll(
    /\{\{WAITING_FOR\}\}/g,
    waitingFor,
  ).replaceAll(/\{\{ACTIVE_FLOW\}\}/g, activeFlow || 'free_chat');

  // Inject the context block before RESPONSE FORMAT
  return CLASSIFICATION_PROMPT.replace(
    'RESPONSE FORMAT',
    contextBlock + '\n\nRESPONSE FORMAT',
  );
}

/**
 * Get the last user message from the message history.
 */
function getLastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (isHumanMessage(msg)) {
      return typeof msg.content === 'string' ? msg.content : '';
    }
  }
  return '';
}

/**
 * Parse the classification response from the LLM.
 * FIX #2: Enhanced with proactive logging for debugging weird LLM outputs.
 */
function parseClassificationResponse(response: string): FlowClassification {
  // Proactive logging for debugging weird LLM outputs
  const originalLength = response.length;

  try {
    // Clean markdown fences and extra whitespace
    let cleaned = response.replaceAll(/```(?:json)?\n?|\n?```/g, '').trim();

    // Detect and log hallucinated comments in JSON
    if (cleaned.includes('//') || cleaned.includes('/*')) {
      logger.warn(
        `[ROUTER PARSE] LLM included comments in JSON: ${cleaned.slice(0, 100)}...`,
      );
      // Remove single-line and multi-line comments
      cleaned = cleaned
        .replaceAll(/\/\/.*$/gm, '')
        .replaceAll(/\/\*[\s\S]*?\*\//g, '');
    }

    // Try to extract JSON from mixed content (LLM may include extra text)
    const jsonMatch = /\{[\s\S]*\}/.exec(cleaned);
    if (jsonMatch) {
      if (jsonMatch[0].length < cleaned.length * 0.8) {
        logger.warn(
          `[ROUTER PARSE] Partial JSON detected: extracted ${jsonMatch[0].length}/${cleaned.length} chars`,
        );
      }
      cleaned = jsonMatch[0];
    } else {
      logger.warn(
        `[ROUTER PARSE] No JSON object found in response: ${cleaned.slice(0, 100)}...`,
      );
      return { flow: 'free_chat', confidence: 0.5, isSelectionResponse: false };
    }

    const parsed: unknown = JSON.parse(cleaned);

    // Use safeParse for better error handling
    const result = FlowClassificationSchema.safeParse(parsed);
    if (result.success) {
      logger.debug(
        `[ROUTER PARSE] Success: flow=${result.data.flow}, confidence=${result.data.confidence}`,
      );
      return result.data;
    }

    // Log specific Zod validation errors
    logger.warn(
      `[ROUTER PARSE] Zod validation failed: ${result.error.message}`,
    );
    return { flow: 'free_chat', confidence: 0.5, isSelectionResponse: false };
  } catch (error) {
    logger.warn(
      `[ROUTER PARSE] JSON parse failed (original ${originalLength} chars): ${error}`,
    );
    // Default to free_chat on parse failure
    return { flow: 'free_chat', confidence: 0.5, isSelectionResponse: false };
  }
}

/**
 * Get the last few messages as context for the router.
 * This helps the router understand if the user is responding to a selection prompt.
 */
function getConversationContext(messages: BaseMessage[]): string {
  const lastMessages = messages.slice(-4); // Get last 4 messages for context
  const context: string[] = [];

  for (const msg of lastMessages) {
    const role = isHumanMessage(msg) ? 'User' : 'Assistant';
    const content =
      typeof msg.content === 'string'
        ? msg.content.substring(0, 200)
        : JSON.stringify(msg.content).substring(0, 200);
    context.push(`${role}: ${content}`);
  }

  return context.join('\n');
}

/**
 * Map selection value to the appropriate flowContext field.
 * Reduces cognitive complexity by centralizing the selection mapping logic.
 */
function mapSelectionToFlowContext(
  context: FlowContext,
  selectedValue: string | string[],
  waitingFor: string,
): void {
  switch (waitingFor) {
    case 'loggerId':
      context.selectedLoggerId = Array.isArray(selectedValue)
        ? selectedValue[0]
        : selectedValue;
      break;
    case 'loggerIds':
      if (Array.isArray(selectedValue)) {
        context.selectedLoggerIds = selectedValue;
      } else {
        context.selectedLoggerIds = selectedValue
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v.length > 0);
      }
      break;
    case 'date':
      context.selectedDate = Array.isArray(selectedValue)
        ? selectedValue[0]
        : selectedValue;
      break;
    case 'dateRange':
      if (Array.isArray(selectedValue) && selectedValue.length === 2) {
        context.dateRange = { start: selectedValue[0], end: selectedValue[1] };
      } else if (typeof selectedValue === 'string') {
        const parts = selectedValue.split(':');
        if (parts.length === 2) {
          context.dateRange = { start: parts[0], end: parts[1] };
        }
      }
      break;
  }
}

/**
 * Type for classification extracted parameters.
 * Matches the Zod schema in flow-state.ts.
 */
interface ClassificationExtractedParams {
  loggerId?: string | null;
  loggerIds?: string[] | null;
  loggerName?: string | null;
  loggerTypePattern?: 'inverter' | 'meteo' | 'all' | null;
  date?: string | null;
  dateRange?: { start: string; end: string } | null;
}

/**
 * Build extracted arguments from classification parameters.
 * Reduces cognitive complexity by centralizing argument extraction logic.
 */
function buildExtractedArgsFromParams(
  params: ClassificationExtractedParams,
): ExtractedArguments {
  const extractedArgs: ExtractedArguments = {};

  if (params.loggerId) {
    extractedArgs.loggerId = params.loggerId;
  }
  if (params.loggerIds && params.loggerIds.length > 0) {
    extractedArgs.loggerIds = params.loggerIds;
  }
  if (params.loggerName) {
    extractedArgs.loggerNamePattern = params.loggerName;
  }
  if (params.loggerTypePattern) {
    extractedArgs.loggerTypePattern = params.loggerTypePattern;
  }
  if (params.date) {
    extractedArgs.date = params.date;
  }
  if (params.dateRange) {
    extractedArgs.dateRange = params.dateRange;
  }

  return extractedArgs;
}

/**
 * Apply extracted parameters to flow context.
 * Reduces cognitive complexity by centralizing context updates.
 */
function applyExtractedParamsToFlowContext(
  flowContext: FlowContext,
  params: ClassificationExtractedParams,
): void {
  if (params.loggerId) {
    flowContext.selectedLoggerId = params.loggerId;
  }
  if (params.loggerIds && params.loggerIds.length > 0) {
    flowContext.selectedLoggerIds = params.loggerIds;
  }
  if (params.loggerName) {
    flowContext.extractedLoggerName = params.loggerName;
  }
  if (params.date) {
    flowContext.selectedDate = params.date;
  }
  if (params.dateRange) {
    flowContext.dateRange = params.dateRange;
  }
}

/**
 * Handle a valid selection response from the user.
 * Maps the selected value to the appropriate flowContext field and resumes the flow.
 * Fix #4: Now emits an acknowledgment message before resuming.
 *
 * @param state - Current flow state
 * @param selectedValue - The value(s) selected by the user
 * @param waitingFor - The argument that was being waited for
 * @param model - LLM model for generating acknowledgment (optional)
 * @returns Updated state to resume the flow
 */
function handleSelectionResponse(
  state: ExplicitFlowState,
  selectedValue: string | string[],
  waitingFor: string,
  model?: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
): Partial<ExplicitFlowState> {
  // Normalize selectedValue to string for processing
  const valueStr = Array.isArray(selectedValue)
    ? selectedValue.join(', ')
    : selectedValue;

  logger.debug(
    `Router: Handling selection response: "${valueStr}" for arg: ${waitingFor}`,
  );

  // Find the pending tool call to satisfy the LLM's tool call contract
  // Must look for AI messages WITH tool_calls, not just any AI message
  const lastAiMessage = state.messages.findLast(
    (m) => isAiMessage(m) && m.tool_calls?.length,
  ) as AIMessage | undefined;
  const pendingToolCall = lastAiMessage?.tool_calls?.find(
    (tc) => tc.name === 'request_user_selection',
  );

  // STRICT ID MATCHING: Only create ToolMessage if we have a valid tool call ID
  // Sending a made-up ID can cause "Invalid Tool Call ID" errors from OpenAI/Anthropic
  let toolMessage: ToolMessage | null = null;
  if (pendingToolCall?.id) {
    toolMessage = new ToolMessage({
      tool_call_id: pendingToolCall.id,
      content: JSON.stringify({
        selection: Array.isArray(selectedValue)
          ? selectedValue
          : [selectedValue],
        selectedFor: waitingFor,
      }),
      name: 'request_user_selection',
    });
    logger.debug(
      `[ROUTER] Created ToolMessage for tool_call_id: ${pendingToolCall.id}`,
    );
  } else {
    logger.warn(
      `[ROUTER] No pending request_user_selection tool call found - skipping ToolMessage`,
    );
  }

  // Build updated flowContext based on which argument was being prompted
  const updatedContext: FlowContext = {
    ...state.flowContext,
    currentPromptArg: undefined, // Clear the prompt arg
    waitingForUserInput: false, // Clear waiting flag
  };

  // Map selection to appropriate flowContext field using helper
  mapSelectionToFlowContext(updatedContext, selectedValue, waitingFor);

  logger.log(
    `User selection processed: ${waitingFor} = ${valueStr}, resuming flow: ${state.activeFlow}`,
  );

  // Fix #4: Generate acknowledgment message for user feedback
  const narrativeEngine = model ? new NarrativeEngine(model) : null;
  const acknowledgment = narrativeEngine
    ? narrativeEngine.generateTransitionMessage(
        state.activeFlow,
        state.activeFlow!,
        {
          reason: 'selection',
          selectedValue,
        },
      )
    : `Got it, analyzing ${valueStr}...`;

  // Return with same flow to continue where we left off
  // CRITICAL: Include ToolMessage first (to satisfy the LLM's tool call contract),
  // then acknowledgment message so user sees immediate feedback
  const messages: BaseMessage[] = [];
  if (toolMessage) {
    messages.push(toolMessage);
  }
  if (acknowledgment) {
    messages.push(new AIMessage({ content: acknowledgment }));
  }

  return {
    messages,
    activeFlow: state.activeFlow,
    flowStep: 1, // Advance past the check_args step
    flowContext: updatedContext,
    recoveryAttempts: state.recoveryAttempts,
  };
}

/**
 * Router node that classifies user intent and routes to appropriate flow.
 *
 * Uses LLM-based classification for flexibility in handling natural language variations.
 * Extracts parameters (logger ID, name, date) during routing to avoid redundant queries.
 */
export async function routerNode(
  state: ExplicitFlowState,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
): Promise<Partial<ExplicitFlowState>> {
  // TODO: DELETE - Debug logging
  logger.debug('[DEBUG ROUTER] === NODE ENTRY ===');
  logger.debug('[DEBUG ROUTER] Input messages count:', state.messages.length);
  logger.debug(
    '[DEBUG ROUTER] FlowContext:',
    JSON.stringify(state.flowContext, null, 2),
  );
  logger.debug('[DEBUG ROUTER] ActiveFlow:', state.activeFlow);
  logger.debug(
    '[DEBUG ROUTER] WaitingForUserInput:',
    state.flowContext?.waitingForUserInput,
  );

  const userMessage = getLastUserMessage(state.messages);

  // TODO: DELETE - Debug logging
  logger.debug('[DEBUG ROUTER] Last user message:', userMessage?.slice(0, 200));

  if (!userMessage) {
    logger.warn('No user message found, defaulting to free_chat');
    return {
      activeFlow: 'free_chat',
      flowStep: 0,
      flowContext: {},
    };
  }

  // Check for simple greetings BEFORE LLM classification (zero latency)
  if (isGreeting(userMessage)) {
    logger.debug(`Detected greeting: "${userMessage.substring(0, 50)}"`);
    return {
      activeFlow: 'greeting',
      flowStep: 0,
      // Use clean context to preserve session-level settings (Fix #5)
      flowContext: createCleanFlowContext(state.flowContext),
      recoveryAttempts: 0,
    };
  }

  logger.debug(`Classifying intent for: "${userMessage.substring(0, 100)}..."`);

  // Get conversation context to help detect selection responses
  const conversationContext = getConversationContext(state.messages);

  // Build classification prompt with selection context if waiting for user input
  const waitingFor = state.flowContext?.currentPromptArg;
  const activeFlow = state.activeFlow;
  const classificationPrompt = buildClassificationPrompt(
    waitingFor,
    activeFlow ?? undefined,
  );

  if (waitingFor) {
    logger.debug(
      `Router: Waiting for ${waitingFor} in flow ${activeFlow}, using context-aware prompt`,
    );
  }

  try {
    // Use the model for classification with conversation context
    const response = await model.invoke([
      new SystemMessage(classificationPrompt),
      new HumanMessage(
        `Recent conversation:\n${conversationContext}\n\nClassify the LAST user message.`,
      ),
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    const classification = parseClassificationResponse(content);

    // TODO: DELETE - Debug logging
    logger.debug('[DEBUG ROUTER] === CLASSIFICATION RESULT ===');
    logger.debug('[DEBUG ROUTER] Raw response:', content.slice(0, 500));
    logger.debug('[DEBUG ROUTER] Flow type:', classification.flow);
    logger.debug('[DEBUG ROUTER] Confidence:', classification.confidence);
    logger.debug(
      '[DEBUG ROUTER] isContinuation:',
      classification.isContinuation,
    );
    logger.debug(
      '[DEBUG ROUTER] isSelectionResponse:',
      classification.isSelectionResponse,
    );
    logger.debug('[DEBUG ROUTER] selectedValue:', classification.selectedValue);
    logger.debug(
      '[DEBUG ROUTER] Extracted params:',
      JSON.stringify(classification.extractedParams, null, 2),
    );

    logger.log(
      `Classified as: ${classification.flow} (confidence: ${classification.confidence}, selection: ${classification.isSelectionResponse || false})`,
    );

    // Handle selection response: user provided a valid selection for the waiting argument
    if (
      classification.isSelectionResponse &&
      classification.selectedValue &&
      waitingFor
    ) {
      return handleSelectionResponse(
        state,
        classification.selectedValue,
        waitingFor,
        model,
      );
    }

    // Build flow context from extracted parameters
    // Start with clean context to preserve session-level settings (Fix #5)
    const flowContext: FlowContext = createCleanFlowContext(state.flowContext);
    if (classification.extractedParams) {
      const params = classification.extractedParams;

      // Apply extracted params to flowContext using helper
      applyExtractedParamsToFlowContext(flowContext, params);

      // Build extractedArgs using helper
      const extractedArgs = buildExtractedArgsFromParams(params);

      // Only set extractedArgs if we have any extractions
      if (Object.keys(extractedArgs).length > 0) {
        flowContext.extractedArgs = extractedArgs;
        logger.debug(`Extracted args: ${JSON.stringify(extractedArgs)}`);
      }
    }

    // TODO: DELETE - Debug logging
    logger.debug('[DEBUG ROUTER] === NODE EXIT ===');
    logger.debug('[DEBUG ROUTER] Routing to flow:', classification.flow);
    logger.debug(
      '[DEBUG ROUTER] FlowContext being returned:',
      JSON.stringify(flowContext, null, 2),
    );

    // Fix #4: Generate transition message when switching flows
    // This gives the user immediate feedback about what's happening
    const isFlowSwitch = classification.flow !== state.activeFlow;
    let transitionMessages: AIMessage[] = [];

    if (isFlowSwitch && classification.flow !== 'greeting') {
      const narrativeEngine = new NarrativeEngine(model);
      const transitionMsg = narrativeEngine.generateTransitionMessage(
        state.activeFlow,
        classification.flow,
        { reason: 'intent_change' },
      );

      if (transitionMsg) {
        transitionMessages = [new AIMessage({ content: transitionMsg })];
        logger.debug(
          `[ROUTER] Emitting transition message: "${transitionMsg}"`,
        );
      }
    }

    return {
      messages: transitionMessages,
      activeFlow: classification.flow,
      flowStep: 0,
      flowContext,
      // Reset recovery attempts for new flow
      recoveryAttempts: 0,
    };
  } catch (error) {
    logger.error(`Classification failed: ${error}`);
    // Default to free_chat on error
    return {
      activeFlow: 'free_chat',
      flowStep: 0,
      flowContext: {},
    };
  }
}

/**
 * Routing function for conditional edges after router node.
 * Returns the flow name to route to.
 */
export function routeToFlow(
  state: ExplicitFlowState,
):
  | 'morning_briefing'
  | 'financial_report'
  | 'performance_audit'
  | 'health_check'
  | 'free_chat'
  | 'greeting' {
  const flow = state.activeFlow || 'free_chat';
  logger.debug(`Routing to flow: ${flow}`);
  return flow as
    | 'morning_briefing'
    | 'financial_report'
    | 'performance_audit'
    | 'health_check'
    | 'free_chat'
    | 'greeting';
}
