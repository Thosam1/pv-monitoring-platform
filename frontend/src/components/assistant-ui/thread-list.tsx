'use client';

import { useState } from 'react';
import {
  ThreadListPrimitive,
  ThreadListItemPrimitive,
  useThreadListItem,
  useThreadListItemRuntime,
} from '@assistant-ui/react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Individual thread list item component with dropdown menu for rename/delete.
 */
function ThreadListItem() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const threadListItem = useThreadListItem();
  const threadListItemRuntime = useThreadListItemRuntime();

  const handleRename = () => {
    const newTitle = window.prompt('Enter new name:', threadListItem.title || 'New Conversation');
    if (newTitle && newTitle.trim()) {
      try {
        threadListItemRuntime.rename(newTitle.trim());
      } catch (error) {
        console.error('Failed to rename conversation:', error);
      }
    }
  };

  const handleDelete = () => {
    if (window.confirm('Delete this conversation?')) {
      try {
        threadListItemRuntime.delete();
      } catch (error) {
        console.error('Failed to delete conversation:', error);
      }
    }
  };

  return (
    <ThreadListItemPrimitive.Root className="group relative flex items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent data-[active=true]:bg-accent">
      <ThreadListItemPrimitive.Trigger className="flex flex-1 items-center gap-2 truncate text-left min-w-0 pr-8">
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">
          <ThreadListItemPrimitive.Title />
        </span>
      </ThreadListItemPrimitive.Trigger>

      {/* 3-dot dropdown menu - positioned absolutely on right with z-index */}
      <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2 z-10 h-6 w-6 shrink-0 opacity-0 transition-opacity',
              'bg-card hover:bg-muted rounded',
              'group-hover:opacity-100 focus:opacity-100',
              isMenuOpen && 'opacity-100'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Options</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right">
          <DropdownMenuItem onClick={handleRename}>
            <Pencil className="h-4 w-4 mr-2" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ThreadListItemPrimitive.Root>
  );
}

export interface ThreadListProps {
  className?: string;
}

/**
 * Thread list sidebar component.
 * Shows all conversation threads with options to create new, rename, or delete.
 */
export function ThreadList({ className }: ThreadListProps) {
  return (
    <ThreadListPrimitive.Root
      className={cn('flex h-full flex-col border-r border-border bg-card', className)}
    >
      {/* Header - padding adjusted to p-2 to match chat header */}
      <div className="flex items-center border-b border-border p-2">
        <h2 className="text-sm font-semibold">Conversations</h2>
      </div>

      {/* Scrollable conversation list */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          <ThreadListPrimitive.Items
            components={{
              ThreadListItem,
            }}
          />
        </div>
      </ScrollArea>

      {/* Footer with New Conversation button */}
      <div className="border-t border-border p-2">
        <ThreadListPrimitive.New asChild>
          <Button type="button" variant="outline" className="w-full justify-start gap-2">
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
        </ThreadListPrimitive.New>
      </div>
    </ThreadListPrimitive.Root>
  );
}
