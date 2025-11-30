'use client';

import {
  Message,
  MessageContent,
  Response,
} from '@/components/ui/ai';
import { Loader } from '@/components/ui/ai/loader';
import { ToolRenderer } from './tool-renderer';
import type { UIMessage } from 'ai';
import { Sun, User } from 'lucide-react';

export interface ChatMessageProps {
  message: UIMessage;
  isLoading?: boolean;
}

/**
 * Renders a single chat message with role-specific styling.
 * Handles text content, tool invocations, and loading states.
 */
export function ChatMessage({ message, isLoading }: ChatMessageProps) {
  const { role, parts } = message;
  const isUser = role === 'user';

  return (
    <Message from={role}>
      {/* Avatar */}
      {isUser ? (
        <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <User className="size-4" />
        </div>
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 text-white">
          <Sun className="size-4" />
        </div>
      )}

      {/* Message Content */}
      <MessageContent className={isUser ? '' : 'max-w-none w-full'}>
        {parts.map((part, index) => {
          // Text content
          if (part.type === 'text') {
            return (
              <Response key={`text-${index}`}>
                {part.text}
              </Response>
            );
          }

          // Tool invocation - handle the tool part structure
          if (part.type.startsWith('tool-')) {
            const toolPart = part as {
              type: string;
              toolCallId: string;
              toolName: string;
              args: Record<string, unknown>;
              state: 'partial-call' | 'call' | 'result';
              result?: unknown;
            };
            return (
              <ToolRenderer
                key={`tool-${toolPart.toolCallId}`}
                toolInvocation={{
                  toolCallId: toolPart.toolCallId,
                  toolName: toolPart.toolName,
                  args: toolPart.args,
                  state: toolPart.state,
                  result: toolPart.result,
                }}
              />
            );
          }

          return null;
        })}

        {/* Loading indicator for streaming */}
        {isLoading && !isUser && parts.length === 0 && (
          <div className="flex items-center gap-2">
            <Loader size={16} />
            <span className="text-sm text-muted-foreground">Thinking...</span>
          </div>
        )}
      </MessageContent>
    </Message>
  );
}
