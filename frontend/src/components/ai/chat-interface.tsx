'use client';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputSubmit,
} from '@/components/ui/ai';
import { ChatMessage } from './chat-message';
import { InlineError } from './chat-error';
import { WorkflowCard } from './workflow-card';
import { cn } from '@/lib/utils';
import { sanitizeLLMOutput } from '@/lib/text-sanitizer';
import { Sun, DollarSign, TrendingDown, Activity, AlertCircle, RefreshCw, type LucideIcon } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { Button } from '@/components/ui/button';

/**
 * Error fallback component for chat message rendering failures.
 * Prevents a single broken message from crashing the entire chat.
 */
function MessageErrorFallback({ error, resetErrorBoundary }: Readonly<FallbackProps>) {
  return (
    <div className="my-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            Failed to render message
          </p>
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">
            {error.message || 'An unexpected error occurred'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={resetErrorBoundary}
            className="mt-2 h-7 text-xs"
          >
            <RefreshCw className="mr-1 h-3 w-3" />
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

// Message types for the chat
export interface ChatPart {
  type: 'text' | 'tool-call' | 'tool-result';
  text?: string;
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown>;
  state?: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: ChatPart[];
}

export interface ChatInterfaceProps {
  chatId: string | null;
  initialMessages?: Message[];
  onMessagesChange?: (messages: Message[]) => void;
  className?: string;
}

type ChatStatus = 'idle' | 'submitted' | 'streaming' | 'error';

// Workflow chip configuration for the empty state
interface WorkflowChip {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  prompt: string;
}

const WORKFLOW_CHIPS: WorkflowChip[] = [
  {
    id: 'morning-briefing',
    icon: Sun,
    title: 'Morning Briefing',
    description: 'Fleet status & critical alerts',
    prompt: 'Give me a fleet overview. If anything is critical, diagnose the errors immediately.',
  },
  {
    id: 'financial-report',
    icon: DollarSign,
    title: 'Financial Report',
    description: 'Savings analysis & forecast',
    prompt: 'Calculate financial savings for the last 30 days and forecast production for next week.',
  },
  {
    id: 'performance-audit',
    icon: TrendingDown,
    title: 'Performance Audit',
    description: 'Efficiency check & comparison',
    prompt: 'Check the performance ratio of my inverters for yesterday and show me a comparison chart of the best vs. worst.',
  },
  {
    id: 'health-check',
    icon: Activity,
    title: 'Deep Health Check',
    description: '7-day anomaly analysis',
    prompt: 'Analyze inverter health for all devices over the last 7 days and list any anomalies.',
  },
];

/**
 * Generate a unique ID for messages.
 */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Assemble message parts, filtering out empty text parts.
 */
function assembleMessageParts(fullText: string, toolCalls: Map<string, ChatPart>): ChatPart[] {
  const parts: ChatPart[] = [];

  // Only add text part if there's actual content
  if (fullText.trim()) {
    parts.push({ type: 'text', text: fullText });
  }

  // Add all tool calls
  parts.push(...Array.from(toolCalls.values()));

  return parts;
}

/**
 * Parse error message from HTTP response.
 */
async function parseErrorMessage(response: Response): Promise<string> {
  let errorMsg = `HTTP error! status: ${response.status}`;
  try {
    const errorData = await response.json();
    if (errorData.message) {
      errorMsg = errorData.message;
    }
  } catch {
    // If parsing fails, use status code message
    errorMsg = getDefaultErrorMessage(response.status, errorMsg);
  }
  return errorMsg;
}

/**
 * Get default error message based on HTTP status code.
 */
function getDefaultErrorMessage(status: number, fallback: string): string {
  const statusMessages: Record<number, string> = {
    400: 'Invalid request. Please try rephrasing your question.',
    500: 'Server error. Please try again.',
    503: 'AI service is unavailable. Please try again later.',
  };
  return statusMessages[status] ?? fallback;
}

/**
 * Create user and assistant message pair for chat.
 */
function createMessagePair(userMessage: string): { userMsg: Message; assistantMsg: Message } {
  const userMsg: Message = {
    id: generateId(),
    role: 'user',
    content: userMessage,
    parts: [{ type: 'text', text: userMessage }],
  };

  const assistantMsg: Message = {
    id: generateId(),
    role: 'assistant',
    content: '',
    parts: [],
  };

  return { userMsg, assistantMsg };
}

/**
 * Process SSE stream chunks from response reader.
 */
async function processStreamChunks(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  fullText: { value: string },
  toolCalls: Map<string, ChatPart>,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim() || !line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        processSSEEvent(parsed, fullText, toolCalls, setMessages);
      } catch {
        // Ignore parse errors for incomplete chunks
      }
    }
  }
}

/**
 * Determine error message from an error.
 */
function classifyError(error: Error & { status?: number }): { message: string } {
  if (!navigator.onLine) {
    return { message: 'Unable to connect. Please check your internet connection.' };
  }
  if (error.message?.includes('fetch') || error.message?.includes('NetworkError')) {
    return { message: 'Network error. Please check your connection and try again.' };
  }
  if (error.status === 400) {
    return { message: error.message || 'Invalid request. Please try rephrasing your question.' };
  }
  if (error.status === 503) {
    return { message: error.message || 'The AI service is temporarily unavailable.' };
  }
  if (error.status === 500) {
    return { message: error.message || 'Server error. Please try again.' };
  }
  return { message: error.message || 'An unexpected error occurred. Please try again.' };
}

/**
 * Process SSE event data and update state.
 */
function processSSEEvent(
  parsed: { type: string; delta?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown },
  fullText: { value: string },
  toolCalls: Map<string, ChatPart>,
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>,
): void {
  // Handle text chunk
  if (parsed.type === 'text-delta') {
    fullText.value += parsed.delta || '';
    const sanitizedText = sanitizeLLMOutput(fullText.value);

    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = {
          ...updated[lastIdx],
          content: sanitizedText,
          parts: assembleMessageParts(sanitizedText, toolCalls),
        };
      }
      return updated;
    });
  }

  // Handle tool call
  if (parsed.type === 'tool-input-available' && parsed.toolCallId) {
    const toolPart: ChatPart = {
      type: 'tool-call',
      toolCallId: parsed.toolCallId,
      toolName: parsed.toolName,
      args: parsed.input as Record<string, unknown>,
      state: 'call',
    };
    toolCalls.set(parsed.toolCallId, toolPart);
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
        updated[lastIdx] = {
          ...updated[lastIdx],
          parts: assembleMessageParts(fullText.value, toolCalls),
        };
      }
      return updated;
    });
  }

  // Handle tool result
  if (parsed.type === 'tool-output-available' && parsed.toolCallId) {
    const existing = toolCalls.get(parsed.toolCallId);
    if (existing) {
      existing.state = 'result';
      existing.result = parsed.output;
      toolCalls.set(parsed.toolCallId, existing);
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            parts: assembleMessageParts(fullText.value, toolCalls),
          };
        }
        return updated;
      });
    }
  }
}

/**
 * Main chat interface component.
 * Handles message streaming via SSE to the backend.
 */
export function ChatInterface({
  chatId,
  initialMessages = [],
  onMessagesChange,
  className,
}: Readonly<ChatInterfaceProps>) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevChatIdRef = useRef<string | null>(null);

  // Notify parent when messages change
  useEffect(() => {
    if (onMessagesChange && messages.length > 0) {
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  // Reset messages only when switching to a different chat (not during streaming)
  useEffect(() => {
    if (chatId !== prevChatIdRef.current) {
      setMessages(chatId ? initialMessages : []);
      prevChatIdRef.current = chatId;
    }
  }, [chatId, initialMessages]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Helper to remove empty assistant message
  const removeEmptyAssistantMessage = useCallback(() => {
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && updated[lastIdx].parts.length === 0) {
        return updated.slice(0, -1);
      }
      return updated;
    });
  }, []);

  // Helper to clear the timeout
  const clearRequestTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Helper to setup request timeout
  const setupRequestTimeout = useCallback(() => {
    clearRequestTimeout();
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    timeoutRef.current = setTimeout(() => {
      abortControllerRef.current?.abort();
      setStatus('error');
      setErrorMessage('The request took too long. Please try again.');
      removeEmptyAssistantMessage();
      timeoutRef.current = null;
    }, 30000);
  }, [clearRequestTimeout, removeEmptyAssistantMessage]);

  // Helper to handle stream errors
  const handleStreamError = useCallback((error: Error & { status?: number; name?: string }) => {
    clearRequestTimeout();

    if (error.name === 'AbortError') {
      if (status !== 'error') setStatus('idle');
      return;
    }

    console.error('Chat error:', error);
    const { message } = classifyError(error);
    setStatus('error');
    setErrorMessage(message);
    removeEmptyAssistantMessage();
  }, [clearRequestTimeout, status, removeEmptyAssistantMessage]);

  // Send message to backend
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim()) return;

    // Store for retry and clear previous errors
    setLastUserMessage(userMessage);
    setStatus('idle');
    setErrorMessage(undefined);

    // Create and add messages
    const { userMsg, assistantMsg } = createMessagePair(userMessage);
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStatus('submitted');

    // Setup abort controller and timeout
    setupRequestTimeout();

    try {
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortControllerRef.current?.signal,
      });

      if (!response.ok) {
        const errorMsg = await parseErrorMessage(response);
        const error = new Error(errorMsg) as Error & { status: number };
        error.status = response.status;
        throw error;
      }

      setStatus('streaming');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const fullText = { value: '' };
      const toolCalls: Map<string, ChatPart> = new Map();
      await processStreamChunks(reader, fullText, toolCalls, setMessages);

      clearRequestTimeout();
      setStatus('idle');
    } catch (error) {
      handleStreamError(error as Error & { status?: number; name?: string });
    }
  }, [messages, setupRequestTimeout, clearRequestTimeout, handleStreamError]);

  // Handle suggestion click with debouncing
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      if (status !== 'idle') return; // Prevent double-clicks while processing
      sendMessage(suggestion);
    },
    [sendMessage, status]
  );

  // Handle form submission
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status !== 'streaming') {
      sendMessage(input);
    }
  };

  // Handle stop button click
  const handleStopClick = () => {
    if (status === 'streaming' && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setStatus('idle');
    }
  };

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Handle user selection from interactive dropdowns
  const handleUserSelection = useCallback(
    (_toolCallId: string, values: string[]) => {
      const selectionText =
        values.length === 1
          ? `I selected: ${values[0]}`
          : `I selected: ${values.join(', ')}`;
      sendMessage(selectionText);
    },
    [sendMessage]
  );

  // Handle retry after error
  const handleRetry = useCallback(() => {
    if (lastUserMessage) {
      // Remove the last user message since we're about to resend it
      setMessages((prev) => {
        // Find last user message index (reverse search)
        let lastUserIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'user') {
            lastUserIdx = i;
            break;
          }
        }
        if (lastUserIdx >= 0) {
          return prev.slice(0, lastUserIdx);
        }
        return prev;
      });
      setStatus('idle');
      setErrorMessage(undefined);
      // Small delay to allow state to settle
      setTimeout(() => sendMessage(lastUserMessage), 100);
    }
  }, [lastUserMessage, sendMessage]
  );

  const isLoading = status === 'submitted' || status === 'streaming';
  const isEmpty = messages.length === 0;

  // Convert to UIMessage format for ChatMessage component
  const uiMessages = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: m.parts.map((p) => {
      if (p.type === 'text') {
        return { type: 'text' as const, text: p.text || '' };
      }
      // Tool parts
      return {
        type: `tool-${p.state || 'call'}` as const,
        toolCallId: p.toolCallId || '',
        toolName: p.toolName || '',
        args: p.args || {},
        state: p.state || 'call',
        result: p.result,
      };
    }),
  }));

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Conversation Area */}
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto max-w-4xl">
          {isEmpty ? (
            <div className="flex h-full flex-col items-center justify-center px-4 py-12">
              <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg">
                <Sun className="size-8 text-white" />
              </div>
              <h1 className="mb-2 text-xl md:text-2xl font-semibold text-foreground text-center">
                Solar Analyst
              </h1>
              <p className="mb-8 max-w-md text-center text-sm md:text-base text-muted-foreground">
                Choose a workflow to get started, or ask me anything.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg px-2">
                {WORKFLOW_CHIPS.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    icon={workflow.icon}
                    title={workflow.title}
                    description={workflow.description}
                    onClick={() => handleSuggestionClick(workflow.prompt)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {uiMessages.map((message, index) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ErrorBoundary FallbackComponent={MessageErrorFallback}>
                      <ChatMessage
                        message={message as Parameters<typeof ChatMessage>[0]['message']}
                        isLoading={
                          isLoading &&
                          index === uiMessages.length - 1 &&
                          message.role === 'assistant'
                        }
                        isLastMessage={index === uiMessages.length - 1}
                        onUserSelection={handleUserSelection}
                        onFollowUpClick={handleSuggestionClick}
                      />
                    </ErrorBoundary>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Error display with retry */}
              <AnimatePresence>
                {status === 'error' && errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <InlineError
                      message={errorMessage}
                      onRetry={handleRetry}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input Area */}
      <div className="bg-background p-4">
        <div className="mx-auto max-w-4xl">
          <PromptInput onSubmit={handleFormSubmit}>
            <PromptInputTextarea
              value={input}
              onChange={handleInputChange}
              disabled={isLoading}
              placeholder="Ask about your solar data..."
            />
            <PromptInputToolbar>
              <PromptInputTools>
                {/* Future: Add attachment buttons here */}
              </PromptInputTools>
              <PromptInputSubmit
                status={status === 'idle' ? 'ready' : status}
                onClick={status === 'streaming' ? handleStopClick : undefined}
                disabled={!input.trim() && status !== 'streaming'}
              />
            </PromptInputToolbar>
          </PromptInput>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Solar Analyst can make mistakes. Verify important data.
          </p>
        </div>
      </div>
    </div>
  );
}
