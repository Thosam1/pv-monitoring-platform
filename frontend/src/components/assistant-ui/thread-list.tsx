'use client';

import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from '@assistant-ui/react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Individual thread list item component.
 *
 * NOTE: Thread deletion is temporarily disabled due to a known issue with
 * assistant-ui's unstable_useRemoteThreadListRuntime API causing app crashes.
 * This will be re-enabled once the library stabilizes or a workaround is found.
 * Users can clear localStorage to reset conversations if needed.
 */
function ThreadListItem() {
  return (
    <ThreadListItemPrimitive.Root className="group relative flex items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent data-[active=true]:bg-accent">
      <ThreadListItemPrimitive.Trigger className="flex flex-1 items-center gap-2 truncate text-left">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          <ThreadListItemPrimitive.Title />
        </span>
      </ThreadListItemPrimitive.Trigger>
      {/*
        Thread deletion temporarily disabled - causes app crash due to
        assistant-ui library state management issue with useRemoteThreadListRuntime.
        TODO: Re-enable when library API stabilizes.
      */}
    </ThreadListItemPrimitive.Root>
  );
}

export interface ThreadListProps {
  className?: string;
}

/**
 * Thread list sidebar component.
 * Shows all conversation threads with options to create new or delete.
 */
export function ThreadList({ className }: ThreadListProps) {
  return (
    <ThreadListPrimitive.Root
      className={cn('flex h-full flex-col border-r border-border bg-card', className)}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 className="text-sm font-semibold">Conversations</h2>
        <ThreadListPrimitive.New asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Plus className="h-4 w-4" />
            <span className="sr-only">New conversation</span>
          </Button>
        </ThreadListPrimitive.New>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          <ThreadListPrimitive.Items
            components={{
              ThreadListItem,
            }}
          />
        </div>
      </ScrollArea>
    </ThreadListPrimitive.Root>
  );
}
