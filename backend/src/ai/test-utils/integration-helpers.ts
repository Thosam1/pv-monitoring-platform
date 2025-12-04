/**
 * Integration test helpers for multi-step conversation testing.
 *
 * Provides utilities for simulating user-agent interactions and
 * validating the complete UX flow.
 */
import { LanggraphService } from '../langgraph.service';
import { CapturedEvents, createEventCapture } from './sse-capture';
import { createClassificationResponse } from './fake-model';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';

/**
 * Message in a conversation turn.
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Result from a multi-turn conversation simulation.
 */
export interface ConversationResult {
  /** All captured events across all turns */
  events: CapturedEvents;
  /** History of all messages sent */
  messageHistory: ConversationTurn[];
  /** Whether the conversation completed successfully */
  success: boolean;
  /** Error if any occurred */
  error?: Error;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Simulate a complete multi-turn conversation.
 *
 * @param service - The LanggraphService instance
 * @param turns - Array of user messages to send
 * @param options - Configuration options
 * @returns Conversation result with all captured events
 *
 * @example
 * ```typescript
 * const result = await simulateConversation(service, [
 *   'Check health',
 *   'I selected: 925',
 * ]);
 * expect(result.events.toolOutputs).toContainEqual(
 *   expect.objectContaining({ toolName: 'render_ui_component' })
 * );
 * ```
 */
export async function simulateConversation(
  service: LanggraphService,
  userMessages: string[],
  options: {
    maxEventsPerTurn?: number;
    timeoutPerTurnMs?: number;
    includeAssistantResponses?: boolean;
  } = {},
): Promise<ConversationResult> {
  const {
    maxEventsPerTurn = 50,
    timeoutPerTurnMs = 30000,
    includeAssistantResponses = true,
  } = options;

  const startTime = Date.now();
  const allEvents = createEventCapture();
  const messageHistory: ConversationTurn[] = [];
  let error: Error | undefined;

  try {
    for (const userMessage of userMessages) {
      // Add user message to history
      messageHistory.push({ role: 'user', content: userMessage });

      // Convert history to API format
      const messages = messageHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Stream response
      const turnStart = Date.now();
      let eventCount = 0;
      let assistantContent = '';

      for await (const event of service.streamChat(messages)) {
        allEvents.addEvent(event);
        eventCount++;

        // Collect assistant text content
        if (event.type === 'text-delta' && event.delta) {
          assistantContent += event.delta;
        }

        // Safety limits
        if (eventCount >= maxEventsPerTurn) break;
        if (Date.now() - turnStart > timeoutPerTurnMs) break;
      }

      // Add assistant response to history if we collected content
      if (includeAssistantResponses && assistantContent.trim()) {
        messageHistory.push({ role: 'assistant', content: assistantContent });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e : new Error(String(e));
  }

  return {
    events: allEvents.getResult(),
    messageHistory,
    success: !error,
    error,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Assert that no duplicate events exist in captured events.
 *
 * @param events - Captured events to check
 * @throws AssertionError if duplicates found
 */
export function assertNoDuplicates(events: CapturedEvents): void {
  // Check tool input duplicates
  const toolInputIds = events.toolInputs.map((e) => e.toolCallId);
  const uniqueToolInputIds = new Set(toolInputIds);
  if (toolInputIds.length !== uniqueToolInputIds.size) {
    const duplicates = toolInputIds.filter(
      (id, idx) => toolInputIds.indexOf(id) !== idx,
    );
    throw new Error(`Duplicate tool-input-available: ${duplicates.join(', ')}`);
  }

  // Check tool output duplicates
  const toolOutputIds = events.toolOutputs.map((e) => e.toolCallId);
  const uniqueToolOutputIds = new Set(toolOutputIds);
  if (toolOutputIds.length !== uniqueToolOutputIds.size) {
    const duplicates = toolOutputIds.filter(
      (id, idx) => toolOutputIds.indexOf(id) !== idx,
    );
    throw new Error(
      `Duplicate tool-output-available: ${duplicates.join(', ')}`,
    );
  }

  // Check text delta duplicates (by trimmed content)
  const textContents = events.textDeltas
    .map((e) => e.delta.trim())
    .filter(Boolean);
  const uniqueTexts = new Set(textContents);
  if (textContents.length !== uniqueTexts.size) {
    const duplicates = textContents.filter(
      (text, idx) => textContents.indexOf(text) !== idx,
    );
    throw new Error(
      `Duplicate text-delta: ${duplicates.slice(0, 3).join(', ')}`,
    );
  }
}

/**
 * Create a model that returns sequential classification responses.
 * Useful for testing multi-step flows where the router needs to
 * classify multiple messages differently.
 *
 * @param classifications - Array of classification configs
 * @returns FakeStreamingChatModel with sequential responses
 *
 * @example
 * ```typescript
 * const model = createSequentialClassificationModel([
 *   { flow: 'health_check', confidence: 0.95 },
 *   { flow: 'health_check', confidence: 0.9, isContinuation: true },
 * ]);
 * ```
 */
export function createSequentialClassificationModel(
  classifications: Array<{
    flow:
      | 'morning_briefing'
      | 'financial_report'
      | 'performance_audit'
      | 'health_check'
      | 'free_chat';
    confidence: number;
    extractedParams?: {
      loggerId?: string;
      loggerName?: string;
      date?: string;
    };
    isContinuation?: boolean;
  }>,
): FakeStreamingChatModel {
  const responses = classifications.map((c) =>
    createClassificationResponse(
      c.flow,
      c.confidence,
      c.extractedParams,
      c.isContinuation,
    ),
  );

  return new FakeStreamingChatModel({
    responses,
    toolStyle: 'openai',
  });
}

/**
 * Extract all tool calls from captured events.
 *
 * @param events - Captured events
 * @returns Map of toolCallId to tool info
 */
export function getToolCallMap(
  events: CapturedEvents,
): Map<string, { toolName: string; input: unknown; output?: unknown }> {
  const map = new Map<
    string,
    { toolName: string; input: unknown; output?: unknown }
  >();

  for (const input of events.toolInputs) {
    map.set(input.toolCallId, {
      toolName: input.toolName,
      input: input.input,
    });
  }

  for (const output of events.toolOutputs) {
    const existing = map.get(output.toolCallId);
    if (existing) {
      existing.output = output.output;
    } else {
      map.set(output.toolCallId, {
        toolName: 'unknown',
        input: undefined,
        output: output.output,
      });
    }
  }

  return map;
}

/**
 * Check if a specific tool was called in the events.
 *
 * @param events - Captured events
 * @param toolName - Name of the tool to check
 * @returns True if the tool was called
 */
export function wasToolCalled(
  events: CapturedEvents,
  toolName: string,
): boolean {
  return events.toolInputs.some((e) => e.toolName === toolName);
}

/**
 * Get the output of a specific tool call.
 *
 * @param events - Captured events
 * @param toolName - Name of the tool
 * @returns Tool output or undefined
 */
export function getToolOutput(
  events: CapturedEvents,
  toolName: string,
): unknown {
  const input = events.toolInputs.find((e) => e.toolName === toolName);
  if (!input) return undefined;

  const output = events.toolOutputs.find(
    (e) => e.toolCallId === input.toolCallId,
  );
  return output?.output;
}

/**
 * Get all text from text-delta events concatenated.
 *
 * @param events - Captured events
 * @returns Concatenated text
 */
export function getFullText(events: CapturedEvents): string {
  return events.textDeltas.map((e) => e.delta).join('');
}

/**
 * Create a mock conversation history for testing.
 *
 * @param turns - Alternating user/assistant messages
 * @returns Array of message objects
 */
export function createConversationHistory(
  ...turns: string[]
): Array<{ role: string; content: string }> {
  return turns.map((content, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content,
  }));
}
