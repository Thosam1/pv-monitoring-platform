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
import { InlineError, type ErrorType } from './chat-error';
import { WorkflowCard } from './workflow-card';
import { cn } from '@/lib/utils';
import { Sun, DollarSign, TrendingDown, Activity, type LucideIcon } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
 * Main chat interface component.
 * Handles message streaming via SSE to the backend.
 */
export function ChatInterface({
  chatId,
  initialMessages = [],
  onMessagesChange,
  className,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [, setErrorType] = useState<ErrorType>('unknown');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [lastUserMessage, setLastUserMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
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

  // Timeout handling for stalled streams
  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') {
      const timeout = setTimeout(() => {
        setStatus('error');
        setErrorType('timeout');
        setErrorMessage('The request took too long. Please try again.');
        // Remove the empty assistant message on timeout
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && updated[lastIdx].parts.length === 0) {
            return updated.slice(0, -1);
          }
          return updated;
        });
      }, 60000); // 60 second timeout
      return () => clearTimeout(timeout);
    }
  }, [status]);

  // Send message to backend
  const sendMessage = useCallback(async (userMessage: string) => {
    if (!userMessage.trim()) return;

    // Store for retry
    setLastUserMessage(userMessage);

    // Clear any previous error
    setStatus('idle');
    setErrorMessage(undefined);

    // Create user message
    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content: userMessage,
      parts: [{ type: 'text', text: userMessage }],
    };

    // Create placeholder assistant message
    const assistantMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      parts: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStatus('submitted');

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Build messages array for the API
      const apiMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      setStatus('streaming');

      // Read the SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      const toolCalls: Map<string, ChatPart> = new Map();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            // Handle text chunk (Vercel AI SDK v5 uses 'delta' not 'textDelta')
            if (parsed.type === 'text-delta') {
              fullText += parsed.delta || '';
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    content: fullText,
                    parts: assembleMessageParts(fullText, toolCalls),
                  };
                }
                return updated;
              });
            }

            // Handle tool call (Vercel AI SDK v5 uses 'tool-input-available' and 'input')
            if (parsed.type === 'tool-input-available') {
              const toolPart: ChatPart = {
                type: 'tool-call',
                toolCallId: parsed.toolCallId,
                toolName: parsed.toolName,
                args: parsed.input,
                state: 'call',
              };
              toolCalls.set(parsed.toolCallId, toolPart);
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    parts: assembleMessageParts(fullText, toolCalls),
                  };
                }
                return updated;
              });
            }

            // Handle tool result (Vercel AI SDK v5 uses 'tool-output-available' and 'output')
            if (parsed.type === 'tool-output-available') {
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
                      parts: assembleMessageParts(fullText, toolCalls),
                    };
                  }
                  return updated;
                });
              }
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }

      setStatus('idle');
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setStatus('idle');
        return;
      }
      console.error('Chat error:', error);

      // Determine error type
      const err = error as Error & { status?: number };
      let type: ErrorType = 'unknown';
      let msg: string | undefined;

      if (!navigator.onLine || err.message?.includes('fetch')) {
        type = 'network';
        msg = 'Unable to connect. Please check your internet connection.';
      } else if (err.status === 400) {
        type = 'api';
        msg = 'Invalid request. Please try rephrasing your question.';
      } else if (err.status === 500 || err.status === 503) {
        type = 'api';
        msg = 'The AI service is temporarily unavailable.';
      }

      setStatus('error');
      setErrorType(type);
      setErrorMessage(msg);

      // Remove the empty assistant message on error
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant' && updated[lastIdx].parts.length === 0) {
          return updated.slice(0, -1);
        }
        return updated;
      });
    }
  }, [messages]);

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
    role: m.role as 'user' | 'assistant' | 'system',
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
            <div className="flex h-full flex-col items-center justify-center py-12">
              <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg">
                <Sun className="size-8 text-white" />
              </div>
              <h1 className="mb-2 text-2xl font-semibold text-foreground">
                Solar Analyst
              </h1>
              <p className="mb-8 max-w-md text-center text-muted-foreground">
                Choose a workflow to get started, or ask me anything.
              </p>
              <div className="grid grid-cols-2 gap-4 max-w-lg">
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
