'use client';

import {useState} from 'react';
/**
 * NOTE: useThreadListItem, useThreadListItemRuntime, and useAssistantRuntime are marked
 * as deprecated in @assistant-ui/react v0.11.x. The library authors marked these as
 * deprecated to prepare users for v0.12.0, but the migration is not possible yet because
 * the replacement APIs (useAssistantApi, useAssistantState) are not available until v0.12.0.
 * We are waiting for the v0.12.0 release to migrate.
 * @see https://github.com/assistant-ui/assistant-ui/releases
 */
import {
    ThreadListPrimitive,
    ThreadListItemPrimitive,
    useThreadListItem,
    useThreadListItemRuntime,
    useAssistantRuntime,
} from '@assistant-ui/react';
import {Button} from '@/components/ui/button';
import {ScrollArea} from '@/components/ui/scroll-area';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {Plus, MessageSquare, MoreHorizontal, Pencil, Trash2, RotateCcw} from 'lucide-react';
import {cn} from '@/lib/utils';

/**
 * Individual thread list item component with dropdown menu for rename/delete.
 */
function ThreadListItem() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const threadListItem = useThreadListItem(); // NOSONAR - deprecated but replacement not available until v0.12.0
    const threadListItemRuntime = useThreadListItemRuntime(); // NOSONAR - deprecated but replacement not available until v0.12.0
    const runtime = useAssistantRuntime(); // NOSONAR - deprecated but replacement not available until v0.12.0

    const handleRename = () => {
        const newTitle = globalThis.window.prompt('Enter new name:', threadListItem.title || 'New Conversation');
        if (newTitle?.trim()) {
            try {
                threadListItemRuntime.rename(newTitle.trim());
            } catch (error) {
                console.error('Failed to rename conversation:', error);
            }
        }
    };

    const handleDelete = async () => {
        if (globalThis.window.confirm('Delete this conversation?')) {
            try {
                const threadIdToDelete = threadListItem.id;
                const threadList = runtime.threadList.getState();

                // Check if we're deleting the currently active thread
                // This is the key distinction - deleting non-active threads is safe,
                // but deleting the active thread requires switching first
                const isActiveThread = threadList.mainThreadId === threadIdToDelete;

                if (isActiveThread) {
                    // Deleting the active thread - must switch away first
                    const remainingThreads = threadList.threads.filter(id => id !== threadIdToDelete);

                    if (remainingThreads.length > 0) {
                        // Switch to the next available thread
                        await runtime.threadList.switchToThread(remainingThreads[0]);
                    } else {
                        // No other threads exist - create a new one first
                        await runtime.threadList.switchToNewThread();
                    }

                    // Longer delay for active thread deletion to ensure context is stable
                    // The library's internal resource cache needs time to update
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // Now safe to delete (context should be stable)
                await threadListItemRuntime.delete();
            } catch (error) {
                console.error('Failed to delete conversation:', error);
                // Error boundary will handle display if needed
            }
        }
    };

    return (
        <ThreadListItemPrimitive.Root
            className="group relative flex items-center rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent data-[active=true]:bg-accent">
            <ThreadListItemPrimitive.Trigger
                className="flex flex-1 items-center gap-2 truncate text-left min-w-0 pr-10">
                <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground"/>
                <span className="truncate">
                  {(() => {
                      const fullTitle = threadListItem.title || '';
                      return fullTitle.length > 12
                          ? `${fullTitle.slice(0, 20)}…`
                          : fullTitle;
                  })()}
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
                            'absolute right-2 top-1/2 -translate-y-1/2 z-20 h-6 w-6 shrink-0',
                            'bg-card hover:bg-muted rounded',
                            'opacity-0 group-hover:opacity-100 focus:opacity-100',
                            isMenuOpen && 'opacity-100'
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <MoreHorizontal className="h-4 w-4"/>
                        <span className="sr-only">Options</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="right">
                    <DropdownMenuItem onClick={handleRename}>
                        <Pencil className="h-4 w-4 mr-2"/>
                        Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                        <Trash2 className="h-4 w-4 mr-2"/>
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
 * Clear all chat history from localStorage.
 * This helps users recover from corrupted state or the "Parent message not found" error.
 */
function clearAllChatHistory() {
    if (globalThis.window === undefined) return;

    const confirmed = globalThis.window.confirm(
        'This will delete all conversations and chat history. This action cannot be undone. Continue?'
    );

    if (!confirmed) return;

    try {
        // Find all localStorage keys that match our storage pattern
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('solar-analyst-threads')) {
                keysToRemove.push(key);
            }
        }

        // Remove all matching keys
        keysToRemove.forEach((key) => localStorage.removeItem(key));

        // Reload the page to reset the application state
        globalThis.window.location.reload();
    } catch (error) {
        console.error('Failed to clear chat history:', error);
        globalThis.window.alert('Failed to clear chat history. Please try again.');
    }
}

/**
 * Thread list sidebar component.
 * Shows all conversation threads with options to create new, rename, or delete.
 */
export function ThreadList({className}: Readonly<ThreadListProps>) {
    return (
        <ThreadListPrimitive.Root
            className={cn('flex h-full flex-col border-r border-border bg-card', className)}
        >
            {/* Header - padding adjusted to p-2 to match chat header */}
            <div className="flex items-center justify-between border-b border-border p-2">
                <h2 className="text-sm font-semibold">Conversations</h2>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={clearAllChatHistory}
                    title="Clear all chat history"
                >
                    <RotateCcw className="h-3.5 w-3.5"/>
                    <span className="sr-only">Clear history</span>
                </Button>
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
                        <Plus className="h-4 w-4"/>
                        New conversation
                    </Button>
                </ThreadListPrimitive.New>
            </div>
        </ThreadListPrimitive.Root>
    );
}
