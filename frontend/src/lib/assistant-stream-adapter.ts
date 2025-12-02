/**
 * SSE Stream Adapter for assistant-ui
 *
 * Converts the backend's custom SSE format to assistant-ui's expected message format.
 *
 * Backend SSE Events:
 * - { type: 'text-delta', delta: string }
 * - { type: 'tool-input-available', toolCallId, toolName, input }
 * - { type: 'tool-output-available', toolCallId, output }
 * - [DONE]
 */

import type {
  TextMessagePart,
  ToolCallMessagePart,
  ThreadAssistantMessagePart,
} from '@assistant-ui/react';

export interface SSEEvent {
  type: 'text-delta' | 'tool-input-available' | 'tool-output-available' | 'error';
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  message?: string;
}

export interface StreamState {
  textContent: string;
  toolCalls: Map<string, ToolCallMessagePart>;
}

/**
 * Create initial stream state
 */
export function createStreamState(): StreamState {
  return {
    textContent: '',
    toolCalls: new Map(),
  };
}

/**
 * Process a single SSE event and update state
 */
export function processSSEEvent(state: StreamState, event: SSEEvent): StreamState {
  const newState = { ...state };

  switch (event.type) {
    case 'text-delta':
      newState.textContent = state.textContent + (event.delta || '');
      break;

    case 'tool-input-available':
      if (event.toolCallId && event.toolName) {
        const toolCall: ToolCallMessagePart = {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: (event.input || {}) as ToolCallMessagePart['args'],
          argsText: JSON.stringify(event.input || {}, null, 2),
          result: undefined,
        };
        newState.toolCalls = new Map(state.toolCalls);
        newState.toolCalls.set(event.toolCallId, toolCall);
      }
      break;

    case 'tool-output-available':
      if (event.toolCallId && state.toolCalls.has(event.toolCallId)) {
        newState.toolCalls = new Map(state.toolCalls);
        const existingCall = state.toolCalls.get(event.toolCallId)!;
        newState.toolCalls.set(event.toolCallId, {
          ...existingCall,
          result: event.output,
        });
      }
      break;

    case 'error':
      // Error events are handled by the caller
      break;
  }

  return newState;
}

/**
 * Convert stream state to assistant-ui content parts
 */
export function stateToContentParts(state: StreamState): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = [];

  // Add text part if there's content
  if (state.textContent.trim()) {
    const textPart: TextMessagePart = {
      type: 'text',
      text: state.textContent,
    };
    parts.push(textPart);
  }

  // Add tool call parts
  for (const toolCall of state.toolCalls.values()) {
    parts.push(toolCall);
  }

  return parts;
}

/**
 * Parse SSE lines from a response body
 */
export async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
): AsyncGenerator<SSEEvent | 'done'> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data: ')) continue;

      const data = line.slice(6);
      if (data === '[DONE]') {
        yield 'done';
        continue;
      }

      try {
        const parsed = JSON.parse(data) as SSEEvent;
        yield parsed;
      } catch {
        // Ignore parse errors for incomplete chunks
      }
    }
  }
}

/**
 * Send message to backend and stream response
 */
export async function* streamChatResponse(
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal
): AsyncGenerator<{
  type: 'content';
  content: ThreadAssistantMessagePart[];
} | {
  type: 'done';
} | {
  type: 'error';
  error: string;
}> {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messages }),
    signal,
  });

  if (!response.ok) {
    yield { type: 'error', error: `HTTP error! status: ${response.status}` };
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    yield { type: 'error', error: 'No response body' };
    return;
  }

  let state = createStreamState();

  for await (const event of parseSSEStream(reader)) {
    if (event === 'done') {
      yield { type: 'done' };
      return;
    }

    if (event.type === 'error') {
      yield { type: 'error', error: event.message || 'Unknown error' };
      return;
    }

    state = processSSEEvent(state, event);
    const content = stateToContentParts(state);

    yield { type: 'content', content };
  }

  // Ensure we signal done if stream ends without [DONE]
  yield { type: 'done' };
}
