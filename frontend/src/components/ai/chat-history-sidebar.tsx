'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MessageSquarePlus, Trash2, MessageSquare } from 'lucide-react';
import { useMemo } from 'react';

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistorySidebarProps {
  conversations: ChatConversation[];
  currentChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;
  className?: string;
}

/**
 * Groups conversations by date (Today, Yesterday, Last 7 Days, Older).
 */
function groupConversationsByDate(conversations: ChatConversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; conversations: ChatConversation[] }[] = [
    { label: 'Today', conversations: [] },
    { label: 'Yesterday', conversations: [] },
    { label: 'Last 7 Days', conversations: [] },
    { label: 'Older', conversations: [] },
  ];

  conversations.forEach((conv) => {
    const convDate = new Date(conv.updatedAt);
    convDate.setHours(0, 0, 0, 0);

    if (convDate >= today) {
      groups[0].conversations.push(conv);
    } else if (convDate >= yesterday) {
      groups[1].conversations.push(conv);
    } else if (convDate >= weekAgo) {
      groups[2].conversations.push(conv);
    } else {
      groups[3].conversations.push(conv);
    }
  });

  // Sort each group by updatedAt descending
  groups.forEach((group) => {
    group.conversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });

  return groups.filter((g) => g.conversations.length > 0);
}

/**
 * Chat history sidebar with grouped conversations.
 */
export function ChatHistorySidebar({
  conversations,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  className,
}: ChatHistorySidebarProps) {
  const groupedConversations = useMemo(
    () => groupConversationsByDate(conversations),
    [conversations]
  );

  return (
    <div
      className={cn(
        'flex h-full w-64 flex-col border-r bg-sidebar',
        className
      )}
    >
      {/* Header */}
      <div className="border-b p-4">
        <h2 className="font-semibold text-sidebar-foreground">Chat History</h2>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2">
        {groupedConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="mb-2 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={onNewChat}
            >
              Start a new chat
            </Button>
          </div>
        ) : (
          groupedConversations.map((group) => (
            <div key={group.label} className="mb-4">
              <h3 className="mb-2 px-2 text-xs font-medium text-muted-foreground uppercase">
                {group.label}
              </h3>
              <div className="space-y-1">
                {group.conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors cursor-pointer',
                      conv.id === currentChatId
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
                    )}
                    onClick={() => onSelectChat(conv.id)}
                  >
                    <MessageSquare className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{conv.title}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(conv.id);
                      }}
                      title="Delete conversation"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-3 space-y-2">
        <Button
          variant="outline"
          className="w-full cursor-pointer"
          onClick={onNewChat}
        >
          <MessageSquarePlus className="size-4 mr-2" />
          New Chat
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Solar Analyst AI
        </p>
      </div>
    </div>
  );
}
