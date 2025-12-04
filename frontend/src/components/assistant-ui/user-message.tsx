'use client';

import { MessagePrimitive } from '@assistant-ui/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { User } from 'lucide-react';

/**
 * Text part component for user messages.
 * Extracted outside UserMessage to avoid recreation on each render.
 */
function UserMessageText({ text }: Readonly<{ text: string }>) {
  return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>;
}

/** Components object for MessagePrimitive.Parts - static to avoid recreation */
const userMessageParts = {
  Text: UserMessageText,
};

/**
 * User message component for the chat thread.
 * Displays user messages with an avatar on the right side.
 */
export function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end py-3">
      <div className="flex max-w-[85%] items-start gap-3">
        <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground">
          <MessagePrimitive.Parts components={userMessageParts} />
        </div>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-muted text-muted-foreground">
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      </div>
    </MessagePrimitive.Root>
  );
}
