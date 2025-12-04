/**
 * Test utilities for creating fake LLM models.
 *
 * Uses FakeStreamingChatModel from @langchain/core for deterministic testing
 * without making any actual LLM API calls.
 */
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
} from '@langchain/core/messages';

/**
 * Create a FakeStreamingChatModel with predetermined responses.
 *
 * @param responses - Array of AIMessage responses to return in sequence
 * @returns Configured FakeStreamingChatModel
 *
 * @example
 * ```typescript
 * const model = createFakeModel([
 *   new AIMessage({ content: 'Hello!' }),
 *   new AIMessage({ content: 'How can I help?' })
 * ]);
 * ```
 */
export function createFakeModel(
  responses: BaseMessage[],
): FakeStreamingChatModel {
  return new FakeStreamingChatModel({
    responses,
    toolStyle: 'openai',
  });
}

/**
 * Create a FakeStreamingChatModel with chunked streaming responses.
 *
 * @param chunks - Array of AIMessageChunk for simulating streaming
 * @returns Configured FakeStreamingChatModel
 *
 * @example
 * ```typescript
 * const model = createFakeStreamingModel([
 *   new AIMessageChunk({ content: 'Hello' }),
 *   new AIMessageChunk({ content: ' World' }),
 * ]);
 * ```
 */
export function createFakeStreamingModel(
  chunks: AIMessageChunk[],
): FakeStreamingChatModel {
  return new FakeStreamingChatModel({
    chunks,
    toolStyle: 'openai',
  });
}

/**
 * Create an AIMessage that contains a tool call.
 *
 * @param toolName - Name of the tool to call
 * @param args - Arguments to pass to the tool
 * @param id - Optional tool call ID (auto-generated if not provided)
 * @returns AIMessage with the tool call
 *
 * @example
 * ```typescript
 * const message = createToolCallMessage('list_loggers', {});
 * const message2 = createToolCallMessage('get_power_curve', { logger_id: '925', date: '2025-01-10' });
 * ```
 */
export function createToolCallMessage(
  toolName: string,
  args: Record<string, unknown>,
  id?: string,
): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [
      {
        name: toolName,
        args,
        id: id || `call_${toolName}_${Date.now()}`,
      },
    ],
  });
}

/**
 * Create an AIMessage with multiple tool calls.
 *
 * @param toolCalls - Array of tool call configurations
 * @returns AIMessage with multiple tool calls
 *
 * @example
 * ```typescript
 * const message = createMultiToolCallMessage([
 *   { name: 'list_loggers', args: {} },
 *   { name: 'get_fleet_overview', args: {} },
 * ]);
 * ```
 */
export function createMultiToolCallMessage(
  toolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
    id?: string;
  }>,
): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: toolCalls.map((tc, index) => ({
      name: tc.name,
      args: tc.args,
      id: tc.id || `call_${tc.name}_${Date.now()}_${index}`,
    })),
  });
}

/**
 * Create an AIMessage with text content and an optional tool call.
 *
 * @param content - Text content of the message
 * @param toolCall - Optional tool call to include
 * @returns AIMessage with content and optional tool call
 *
 * @example
 * ```typescript
 * const message = createTextWithToolMessage(
 *   'I found some anomalies...',
 *   { name: 'render_ui_component', args: { component: 'HealthReport', props: {} } }
 * );
 * ```
 */
export function createTextWithToolMessage(
  content: string,
  toolCall?: { name: string; args: Record<string, unknown>; id?: string },
): AIMessage {
  return new AIMessage({
    content,
    tool_calls: toolCall
      ? [
          {
            name: toolCall.name,
            args: toolCall.args,
            id: toolCall.id || `call_${toolCall.name}_${Date.now()}`,
          },
        ]
      : [],
  });
}

/**
 * Create a classification response for router node testing.
 *
 * @param flow - The flow type to classify as
 * @param confidence - Confidence score (0-1)
 * @param extractedParams - Optional extracted parameters
 * @returns AIMessage with JSON classification response
 *
 * @example
 * ```typescript
 * const model = createFakeModel([
 *   createClassificationResponse('health_check', 0.95, { loggerId: '925' })
 * ]);
 * ```
 */
/**
 * Options for creating a classification response.
 */
export interface ClassificationResponseOptions {
  /** If true, user is continuing a previous flow */
  isContinuation?: boolean;
  /** If true, user is providing a valid selection response */
  isSelectionResponse?: boolean;
  /** The selected value(s) when isSelectionResponse is true */
  selectedValue?: string | string[];
}

export function createClassificationResponse(
  flow:
    | 'morning_briefing'
    | 'financial_report'
    | 'performance_audit'
    | 'health_check'
    | 'free_chat',
  confidence: number,
  extractedParams?: {
    loggerId?: string;
    loggerIds?: string[];
    loggerName?: string;
    date?: string;
    dateRange?: { start: string; end: string };
  },
  isContinuationOrOptions?: boolean | ClassificationResponseOptions,
): AIMessage {
  // Support both old signature (boolean) and new signature (options object)
  const options: ClassificationResponseOptions =
    typeof isContinuationOrOptions === 'boolean'
      ? { isContinuation: isContinuationOrOptions }
      : (isContinuationOrOptions ?? {});

  const response = {
    flow,
    confidence,
    isContinuation: options.isContinuation ?? false,
    isSelectionResponse: options.isSelectionResponse ?? false,
    selectedValue: options.selectedValue ?? null,
    extractedParams: extractedParams ?? {},
  };
  return new AIMessage({ content: JSON.stringify(response) });
}

/**
 * Create a model that throws an error for testing error handling.
 *
 * @param errorMessage - Error message to throw
 * @returns FakeStreamingChatModel configured to throw
 */
export function createErrorModel(errorMessage: string): FakeStreamingChatModel {
  return new FakeStreamingChatModel({
    responses: [],
    thrownErrorString: errorMessage,
  });
}
