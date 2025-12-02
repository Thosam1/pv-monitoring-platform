'use client';

import { type ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
} from '@assistant-ui/react';
import {
  createStreamState,
  processSSEEvent,
  stateToContentParts,
  parseSSEStream,
  type SSEEvent,
} from '@/lib/assistant-stream-adapter';

/**
 * Custom ChatModelAdapter that connects to our NestJS backend.
 * Handles the custom SSE format (text-delta, tool-input-available, tool-output-available).
 */
const SolarAnalystModelAdapter: ChatModelAdapter = {
  async *run({ messages, abortSignal }) {
    // Convert assistant-ui messages to our backend format
    const apiMessages = messages.map((m) => {
      // Extract text content from message parts
      let content = '';
      for (const part of m.content) {
        if (part.type === 'text') {
          content += part.text;
        }
      }
      return {
        role: m.role,
        content,
      };
    });

    // Make the API request
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: apiMessages }),
      signal: abortSignal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    // Parse SSE stream and accumulate state
    let state = createStreamState();

    for await (const event of parseSSEStream(reader)) {
      if (event === 'done') {
        break;
      }

      const sseEvent = event as SSEEvent;

      if (sseEvent.type === 'error') {
        throw new Error(sseEvent.message || 'Unknown error from backend');
      }

      state = processSSEEvent(state, sseEvent);
      const content = stateToContentParts(state);

      // Only yield if we have content
      if (content.length > 0) {
        yield {
          content: content as ThreadAssistantMessagePart[],
        };
      }
    }

    // Final yield with all accumulated content
    const finalContent = stateToContentParts(state);
    if (finalContent.length > 0) {
      yield {
        content: finalContent as ThreadAssistantMessagePart[],
      };
    }
  },
};

export interface MyRuntimeProviderProps {
  children: ReactNode;
}

/**
 * Runtime provider component for the Solar Analyst AI chat.
 * Wraps the application with assistant-ui's runtime context.
 */
export function MyRuntimeProvider({ children }: MyRuntimeProviderProps) {
  const runtime = useLocalRuntime(SolarAnalystModelAdapter, {
    // Set max steps for tool calling chains
    maxSteps: 10,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
