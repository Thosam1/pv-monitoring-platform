'use client';

import { MessagePrimitive } from '@assistant-ui/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MarkdownText } from './markdown-text';
import { Sun } from 'lucide-react';

/**
 * Fallback component for tool calls.
 * Returns null since tool UIs are rendered by makeAssistantToolUI components.
 * This prevents React from trying to render raw tool call objects.
 */
function ToolCallFallback() {
  return null;
}

/**
 * Assistant message component for the chat thread.
 * Displays assistant messages with solar analyst branding on the left.
 */
export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full py-3">
      <div className="flex max-w-[85%] items-start gap-3">
        <Avatar className="h-8 w-8 shrink-0 border border-primary/20">
          <AvatarFallback className="bg-primary/10 text-primary">
            <Sun className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <MessagePrimitive.Parts
            components={{
              Text: MarkdownText,
              tools: {
                Fallback: ToolCallFallback,
              },
            }}
          />
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}
