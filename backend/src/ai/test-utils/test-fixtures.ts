/**
 * Test fixtures for AI module testing.
 *
 * Contains common test data and state builders for unit tests.
 */
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import type {
  ExplicitFlowState,
  FlowType,
  FlowContext,
  PendingUiAction,
} from '../types/flow-state';

/**
 * Sample user messages for testing intent classification.
 */
export const USER_MESSAGES = {
  // Morning briefing intents
  morningBriefing: [
    'Give me a morning briefing',
    'How is the site doing?',
    'Fleet overview please',
    'Status report',
    'How is everything today?',
  ],

  // Financial report intents
  financialReport: [
    'How much did I save this month?',
    'What is my ROI?',
    'Financial report please',
    'How much money am I saving?',
    'Show me the financial analysis',
  ],

  // Performance audit intents
  performanceAudit: [
    'Compare all my inverters',
    'Which logger performs best?',
    'Performance comparison',
    'Compare 925 and 926',
    'Efficiency audit',
  ],

  // Health check intents
  healthCheck: [
    'Check health of logger 925',
    'Are there any anomalies?',
    'Health status of my inverters',
    'Any problems with the system?',
    'Check for issues',
  ],

  // Free chat intents (fallback)
  freeChat: [
    'What is the power output right now?',
    'Show me the data for yesterday',
    'Get power curve for logger 925 on January 10th',
    'What was the peak power today?',
    'Tell me about solar energy',
  ],

  // Selection responses
  selectionResponses: [
    'I selected: 925',
    '925',
    '2025-01-10',
    'I selected: 2025-01-10',
    'Use logger 926',
  ],
};

/**
 * Create a minimal ExplicitFlowState for testing.
 *
 * @param overrides - Partial state overrides
 * @returns Complete ExplicitFlowState
 */
export function createTestState(
  overrides: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  return {
    messages: [],
    recoveryAttempts: 0,
    pendingUiActions: [],
    activeFlow: null,
    flowStep: 0,
    flowContext: {},
    ...overrides,
  };
}

/**
 * Create a state with a user message.
 *
 * @param message - User message content
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState with user message
 */
export function createStateWithUserMessage(
  message: string,
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  return createTestState({
    messages: [new HumanMessage(message)],
    ...additionalState,
  });
}

/**
 * Create a state with conversation history.
 *
 * @param history - Array of [role, content] tuples
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState with message history
 */
export function createStateWithHistory(
  history: Array<['user' | 'assistant' | 'system' | 'tool', string]>,
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  const messages = history.map(([role, content]) => {
    switch (role) {
      case 'user':
        return new HumanMessage(content);
      case 'assistant':
        return new AIMessage(content);
      case 'system':
        return new SystemMessage(content);
      case 'tool':
        return new ToolMessage({ content, tool_call_id: 'test_tool_call' });
      default:
        return new HumanMessage(content);
    }
  });

  return createTestState({
    messages,
    ...additionalState,
  });
}

/**
 * Create a state mid-flow with context.
 *
 * @param flow - Active flow type
 * @param flowContext - Flow context data
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState configured for mid-flow
 */
export function createMidFlowState(
  flow: FlowType,
  flowContext: FlowContext,
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  return createTestState({
    activeFlow: flow,
    flowStep: 1,
    flowContext,
    ...additionalState,
  });
}

/**
 * Create a state with pending UI actions.
 *
 * @param actions - Pending UI actions
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState with pending UI actions
 */
export function createStateWithPendingActions(
  actions: PendingUiAction[],
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  return createTestState({
    pendingUiActions: actions,
    ...additionalState,
  });
}

/**
 * Create a state requiring recovery.
 *
 * @param recoveryType - Type of recovery needed
 * @param availableRange - Available date range (for no_data_in_window)
 * @returns ExplicitFlowState configured for recovery
 */
export function createRecoveryState(
  recoveryType: 'no_data_in_window' | 'no_data' | 'error',
  availableRange?: { start: string; end: string },
): ExplicitFlowState {
  return createTestState({
    recoveryAttempts: 1,
    flowContext: {
      toolResults: {
        needsRecovery: true,
        recoveryType,
        ...(availableRange && { availableRange }),
        errorDetails: {
          message: `Test ${recoveryType} error`,
          ...(availableRange && { availableRange }),
        },
      },
    },
  });
}

/**
 * Sample logger data for testing.
 */
export const SAMPLE_LOGGERS = [
  {
    loggerId: '925',
    loggerType: 'goodwe',
    recordCount: 15000,
    dataRange: {
      earliestData: '2024-06-01T00:00:00Z',
      latestData: '2025-01-15T23:45:00Z',
    },
  },
  {
    loggerId: '926',
    loggerType: 'lti',
    recordCount: 8500,
    dataRange: {
      earliestData: '2024-08-15T00:00:00Z',
      latestData: '2025-01-15T23:30:00Z',
    },
  },
  {
    loggerId: 'MBMET-001',
    loggerType: 'mbmet',
    recordCount: 12000,
    dataRange: {
      earliestData: '2024-07-01T00:00:00Z',
      latestData: '2025-01-15T23:00:00Z',
    },
  },
];

/**
 * Sample anomaly data for health tests.
 */
export const SAMPLE_ANOMALIES = [
  {
    timestamp: '2025-01-10T10:30:00Z',
    type: 'daytime_outage',
    description: 'Zero power output during sunny conditions',
    severity: 'high' as const,
    metrics: { power: 0, irradiance: 450 },
  },
  {
    timestamp: '2025-01-12T14:15:00Z',
    type: 'underperformance',
    description: 'Power output 40% below expected',
    severity: 'medium' as const,
    metrics: { power: 2100, irradiance: 680 },
  },
];

/**
 * Sample power curve data for chart tests.
 */
export const SAMPLE_POWER_CURVE = [
  { timestamp: '2025-01-10T06:00:00Z', power: 0, irradiance: 0 },
  { timestamp: '2025-01-10T08:00:00Z', power: 1200, irradiance: 350 },
  { timestamp: '2025-01-10T10:00:00Z', power: 3500, irradiance: 620 },
  { timestamp: '2025-01-10T12:00:00Z', power: 5200, irradiance: 850 },
  { timestamp: '2025-01-10T14:00:00Z', power: 4800, irradiance: 780 },
  { timestamp: '2025-01-10T16:00:00Z', power: 2100, irradiance: 380 },
  { timestamp: '2025-01-10T18:00:00Z', power: 200, irradiance: 50 },
];

/**
 * Helper to extract tool calls from a state's messages.
 *
 * @param state - The flow state to examine
 * @returns Array of tool calls from AI messages
 */
export function extractToolCalls(
  state: ExplicitFlowState,
): Array<{ name: string; args: unknown; id?: string }> {
  const toolCalls: Array<{ name: string; args: unknown; id?: string }> = [];

  for (const msg of state.messages) {
    if (msg._getType() === 'ai') {
      const aiMsg = msg as AIMessage;
      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        toolCalls.push(...aiMsg.tool_calls);
      }
    }
  }

  return toolCalls;
}

/**
 * Helper to get the last AI message content.
 *
 * @param state - The flow state to examine
 * @returns Content of the last AI message or null
 */
export function getLastAIMessageContent(
  state: ExplicitFlowState,
): string | null {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const msg = state.messages[i];
    if (msg._getType() === 'ai') {
      return typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content);
    }
  }
  return null;
}

/**
 * Create a state that is waiting for user input.
 *
 * @param argName - The argument being prompted for
 * @param flow - The active flow type
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState waiting for user input
 */
export function createStateWithWaitingForInput(
  argName: string,
  flow: FlowType,
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  return createTestState({
    activeFlow: flow,
    flowStep: 0,
    flowContext: {
      waitingForUserInput: true,
      currentPromptArg: argName,
    },
    pendingUiActions: [
      {
        toolCallId: `pending_${argName}_${Date.now()}`,
        toolName: 'request_user_selection',
        args: {
          prompt: `Select ${argName}`,
          options: [],
          selectionType: 'single',
          inputType: 'dropdown',
        },
      },
    ],
    ...additionalState,
  });
}

/**
 * Create a state with extracted arguments from the router.
 *
 * @param args - Extracted arguments
 * @param flow - Active flow type
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState with extracted arguments
 */
export function createStateWithExtractedArgs(
  args: {
    loggerId?: string;
    loggerIds?: string[];
    loggerNamePattern?: string;
    loggerTypePattern?: 'inverter' | 'meteo' | 'all';
    date?: string;
    dateRange?: { start: string; end: string };
  },
  flow: FlowType = 'health_check',
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  return createTestState({
    activeFlow: flow,
    flowStep: 0,
    flowContext: {
      extractedArgs: args,
      extractedLoggerName: args.loggerNamePattern,
      selectedLoggerId: args.loggerId,
      selectedLoggerIds: args.loggerIds,
      selectedDate: args.date,
      dateRange: args.dateRange,
    },
    ...additionalState,
  });
}

/**
 * Create a multi-turn conversation state.
 *
 * @param turns - Array of message contents (alternating user/assistant)
 * @param flow - Optional active flow
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState with conversation history
 */
export function createMultiTurnConversation(
  turns: string[],
  flow: FlowType | null = null,
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  const history = turns.map(
    (content, index): ['user' | 'assistant', string] => [
      index % 2 === 0 ? 'user' : 'assistant',
      content,
    ],
  );

  return createStateWithHistory(history, {
    activeFlow: flow,
    ...additionalState,
  });
}

/**
 * Create a state simulating a user selection response.
 *
 * @param selectionValue - The value the user selected
 * @param flow - The active flow
 * @param argName - The argument that was being selected
 * @param additionalState - Additional state overrides
 * @returns ExplicitFlowState with selection response
 */
export function createStateWithSelectionResponse(
  selectionValue: string | string[],
  flow: FlowType,
  argName: string,
  additionalState: Partial<ExplicitFlowState> = {},
): ExplicitFlowState {
  const selectionMessage = Array.isArray(selectionValue)
    ? `I selected: ${selectionValue.join(', ')}`
    : `I selected: ${selectionValue}`;

  return createTestState({
    activeFlow: flow,
    flowStep: 0,
    flowContext: {
      waitingForUserInput: true,
      currentPromptArg: argName,
    },
    messages: [
      new HumanMessage('Check health'),
      new AIMessage({ content: `Please select a ${argName}` }),
      new HumanMessage(selectionMessage),
    ],
    ...additionalState,
  });
}
