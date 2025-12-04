'use client';

import { type ReactNode, useMemo, useRef, useEffect } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  unstable_useRemoteThreadListRuntime as useRemoteThreadListRuntime,
  useThreadListItem,
  RuntimeAdapterProvider,
  type ChatModelAdapter,
  type ThreadAssistantMessagePart,
  type unstable_RemoteThreadListAdapter as RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
  type ExportedMessageRepository,
} from '@assistant-ui/react';
import {
  createStreamState,
  processSSEEvent,
  stateToContentParts,
  parseSSEStream,
  type SSEEvent,
} from '@/lib/assistant-stream-adapter';
import { createAssistantStream } from 'assistant-stream';

const STORAGE_KEY = 'solar-analyst-threads';

/**
 * Module-level ref to store the current thread ID for the model adapter.
 * This is updated by the thread provider when the thread changes.
 */
let currentThreadId: string | null = null;

interface StoredThread {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

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

    // Make the API request with thread ID for checkpointing
    const threadId = currentThreadId;
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: apiMessages, threadId }),
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

/**
 * LocalStorage thread list adapter for multi-thread support.
 */
const localStorageThreadListAdapter: RemoteThreadListAdapter = {
  async list() {
    if (typeof window === 'undefined') {
      return { threads: [] };
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];

      return {
        threads: threads.map((t) => ({
          status: t.archived ? ('archived' as const) : ('regular' as const),
          remoteId: t.id,
          title: t.title,
        })),
      };
    } catch {
      return { threads: [] };
    }
  },

  async initialize(threadId: string) {
    if (typeof window === 'undefined') {
      return { remoteId: threadId, externalId: threadId };
    }

    const newThread: StoredThread = {
      id: threadId,
      title: 'New Conversation',
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
      threads.unshift(newThread);
      localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
    } catch (error) {
      console.error('Failed to initialize thread:', error);
    }

    return { remoteId: threadId, externalId: threadId };
  },

  async rename(remoteId: string, newTitle: string) {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
      const thread = threads.find((t) => t.id === remoteId);
      if (thread) {
        thread.title = newTitle;
        thread.updatedAt = new Date().toISOString();
        localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
      }
    } catch (error) {
      console.error('Failed to rename thread:', error);
    }
  },

  async archive(remoteId: string) {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
      const thread = threads.find((t) => t.id === remoteId);
      if (thread) {
        thread.archived = true;
        thread.updatedAt = new Date().toISOString();
        localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
      }
    } catch (error) {
      console.error('Failed to archive thread:', error);
    }
  },

  async unarchive(remoteId: string) {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
      const thread = threads.find((t) => t.id === remoteId);
      if (thread) {
        thread.archived = false;
        thread.updatedAt = new Date().toISOString();
        localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
      }
    } catch (error) {
      console.error('Failed to unarchive thread:', error);
    }
  },

  async delete(remoteId: string) {
    if (typeof window === 'undefined') return;

    try {
      // Delete thread metadata
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
      const filtered = threads.filter((t) => t.id !== remoteId);
      localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(filtered));

      // Delete thread messages
      localStorage.removeItem(`${STORAGE_KEY}-${remoteId}`);
    } catch (error) {
      console.error('Failed to delete thread:', error);
    }
  },

  async fetch(threadId: string) {
    if (typeof window === 'undefined') {
      return {
        status: 'regular' as const,
        remoteId: threadId,
        title: 'New Conversation',
      };
    }

    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
      const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
      const thread = threads.find((t) => t.id === threadId);

      if (thread) {
        return {
          status: thread.archived ? ('archived' as const) : ('regular' as const),
          remoteId: thread.id,
          externalId: thread.id,
          title: thread.title,
        };
      }
    } catch (error) {
      console.error('Failed to fetch thread:', error);
    }

    return {
      status: 'regular' as const,
      remoteId: threadId,
      title: 'New Conversation',
    };
  },

  async generateTitle(remoteId: string, messages: readonly ThreadMessage[]) {
    // Extract title from first user message
    const firstUserMessage = messages.find((m) => m.role === 'user');
    let title = 'New Conversation';

    if (firstUserMessage) {
      const textContent = firstUserMessage.content
        .filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join(' ');

      if (textContent) {
        title = textContent.length > 50 ? `${textContent.substring(0, 50)}...` : textContent;
      }
    }

    // Update title in storage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
        const threads: StoredThread[] = stored ? JSON.parse(stored) : [];
        const thread = threads.find((t) => t.id === remoteId);
        if (thread) {
          thread.title = title;
          thread.updatedAt = new Date().toISOString();
          localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
        }
      } catch (error) {
        console.error('Failed to update title:', error);
      }
    }

    // Return AssistantStream with the title
    return createAssistantStream((controller) => {
      controller.appendText(title);
      controller.close();
    });
  },

  unstable_Provider: ({ children }: { children?: ReactNode }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const threadListItem = useThreadListItem();
    const remoteId = threadListItem.remoteId;

    // Update module-level thread ID for the model adapter to access
    // This enables LangGraph checkpointing for multi-turn flows
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      currentThreadId = remoteId ?? null;
    }, [remoteId]);

    // Queue for messages that arrive before remoteId is available
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const pendingMessagesRef = useRef<ExportedMessageRepository['messages']>([]);

    // Flush pending messages when remoteId becomes available
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (!remoteId || typeof window === 'undefined' || pendingMessagesRef.current.length === 0) {
        return;
      }

      const pendingMessages = [...pendingMessagesRef.current];
      pendingMessagesRef.current = [];

      try {
        const stored = localStorage.getItem(`${STORAGE_KEY}-${remoteId}`);
        const repository: ExportedMessageRepository = stored
          ? JSON.parse(stored)
          : { messages: [] };

        for (const item of pendingMessages) {
          repository.messages.push(item);
          repository.headId = item.message.id;
        }

        localStorage.setItem(`${STORAGE_KEY}-${remoteId}`, JSON.stringify(repository));

        // Update metadata timestamp
        const metaStored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
        const threads: StoredThread[] = metaStored ? JSON.parse(metaStored) : [];
        const thread = threads.find((t) => t.id === remoteId);
        if (thread) {
          thread.updatedAt = new Date().toISOString();
          localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
        }
      } catch (error) {
        console.error('Failed to flush pending messages:', error);
      }
    }, [remoteId]);

    // Create thread-specific history adapter
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const history = useMemo<ThreadHistoryAdapter>(
      () => ({
        async load() {
          if (!remoteId || typeof window === 'undefined') {
            return { messages: [] };
          }

          try {
            const stored = localStorage.getItem(`${STORAGE_KEY}-${remoteId}`);
            const repository: ExportedMessageRepository = stored
              ? JSON.parse(stored)
              : { messages: [] };

            return repository;
          } catch {
            return { messages: [] };
          }
        },

        async append(item) {
          if (typeof window === 'undefined') {
            return;
          }

          // If remoteId not yet available, queue the message for later
          if (!remoteId) {
            pendingMessagesRef.current.push({
              message: item.message,
              parentId: item.parentId ?? null,
              runConfig: item.runConfig,
            });
            return;
          }

          try {
            const stored = localStorage.getItem(`${STORAGE_KEY}-${remoteId}`);
            const repository: ExportedMessageRepository = stored
              ? JSON.parse(stored)
              : { messages: [] };

            // Validate parentId - ensure it exists in the repository
            // This prevents the "Parent message not found" error in assistant-ui
            let validatedParentId = item.parentId;
            if (validatedParentId) {
              const parentExists = repository.messages.some(
                (m) => m.message.id === validatedParentId
              );
              if (!parentExists) {
                // If parent doesn't exist, use the last message's id or null
                const lastMessage = repository.messages[repository.messages.length - 1];
                validatedParentId = lastMessage?.message.id ?? null;
              }
            }

            repository.messages.push({
              message: item.message,
              parentId: validatedParentId,
              runConfig: item.runConfig,
            });

            // Update headId if needed
            repository.headId = item.message.id;

            localStorage.setItem(`${STORAGE_KEY}-${remoteId}`, JSON.stringify(repository));

            // Update thread's updatedAt timestamp
            const metaStored = localStorage.getItem(`${STORAGE_KEY}-metadata`);
            const threads: StoredThread[] = metaStored ? JSON.parse(metaStored) : [];
            const thread = threads.find((t) => t.id === remoteId);
            if (thread) {
              thread.updatedAt = new Date().toISOString();
              localStorage.setItem(`${STORAGE_KEY}-metadata`, JSON.stringify(threads));
            }
          } catch (error) {
            console.error('Failed to save message:', error);
          }
        },
      }),
      [remoteId],
    );

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const adapters = useMemo(() => ({ history }), [history]);

    return <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>;
  },
};

export interface MyRuntimeProviderProps {
  children: ReactNode;
}

/**
 * Runtime provider component for the Solar Analyst AI chat.
 * Wraps the application with assistant-ui's runtime context with multi-thread support.
 */
export function MyRuntimeProvider({ children }: MyRuntimeProviderProps) {
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: () =>
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useLocalRuntime(SolarAnalystModelAdapter, {
        maxSteps: 10,
      }),
    adapter: localStorageThreadListAdapter,
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
