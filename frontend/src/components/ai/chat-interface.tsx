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
  Suggestions,
  Suggestion,
} from '@/components/ui/ai';
import { ChatMessage } from './chat-message';
import { cn } from '@/lib/utils';
import { Sun } from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';

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

const SUGGESTIONS = [
  "Show me today's power production",
  'Compare all loggers performance',
  "What's the fleet overview?",
  'Analyze inverter health',
];

/**
 * Generate a unique ID for messages.
 */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
  const abortControllerRef = useRef<AbortController | null>(null);

  // Notify parent when messages change
  useEffect(() => {
    if (onMessagesChange && messages.length > 0) {
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  // Reset messages when chatId changes
  useEffect(() => {
    if (chatId) {
      setMessages(initialMessages);
    } else {
      setMessages([]);
    }
  }, [chatId, initialMessages]);

  // Timeout handling for stalled streams
  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') {
      const timeout = setTimeout(() => {
        setStatus('error');
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: 'Request timed out. Please try again.',
              parts: [{ type: 'text', text: 'Request timed out. Please try again.' }],
            };
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
                    parts: [
                      { type: 'text', text: fullText },
                      ...Array.from(toolCalls.values()),
                    ],
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
                    parts: [
                      ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
                      ...Array.from(toolCalls.values()),
                    ],
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
                      parts: [
                        ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
                        ...Array.from(toolCalls.values()),
                      ],
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
      setStatus('error');
      // Update assistant message with error
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: 'Sorry, an error occurred. Please try again.',
            parts: [{ type: 'text', text: 'Sorry, an error occurred. Please try again.' }],
          };
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
                Ask me anything about your solar data. I can analyze inverter
                performance, compare loggers, and generate charts.
              </p>
              <Suggestions className="justify-center">
                {SUGGESTIONS.map((suggestion) => (
                  <Suggestion
                    key={suggestion}
                    suggestion={suggestion}
                    onClick={handleSuggestionClick}
                  />
                ))}
              </Suggestions>
            </div>
          ) : (
            <div className="space-y-2">
              {uiMessages.map((message, index) => (
                <ChatMessage
                  key={message.id}
                  message={message as Parameters<typeof ChatMessage>[0]['message']}
                  isLoading={
                    isLoading &&
                    index === uiMessages.length - 1 &&
                    message.role === 'assistant'
                  }
                />
              ))}
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
