'use client';

import { ChatInterface } from '@/components/ai/chat-interface';
import { ChatHistorySidebar, type ChatConversation } from '@/components/ai/chat-history-sidebar';
import { useAIChat } from '@/hooks/use-ai-chat';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AIChatViewProps {
  className?: string;
}

/**
 * AI Chat page layout with history sidebar and main chat area.
 */
export function AIChatView({ className }: AIChatViewProps) {
  const {
    conversations,
    currentChatId,
    currentMessages,
    createNewChat,
    selectChat,
    deleteChat,
    updateMessages,
    ensureChat,
  } = useAIChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Convert internal conversations to sidebar format
  const sidebarConversations: ChatConversation[] = conversations.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  // Handle new chat - create and select
  const handleNewChat = () => {
    createNewChat();
  };

  // Handle messages change - auto-create chat if needed
  const handleMessagesChange = (messages: Parameters<typeof updateMessages>[0]) => {
    if (!currentChatId && messages.length > 0) {
      ensureChat();
    }
    updateMessages(messages);
  };

  return (
    <div className={cn('flex h-full', className)}>
      {/* Chat History Sidebar */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-0'
        )}
      >
        {sidebarOpen && (
          <ChatHistorySidebar
            conversations={sidebarConversations}
            currentChatId={currentChatId}
            onSelectChat={selectChat}
            onNewChat={handleNewChat}
            onDeleteChat={deleteChat}
          />
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Sidebar Toggle */}
        <div className="flex items-center border-b p-2">
          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
        </div>

        {/* Chat Interface */}
        <ChatInterface
          key={currentChatId || 'new'}
          chatId={currentChatId}
          initialMessages={currentMessages}
          onMessagesChange={handleMessagesChange}
          className="flex-1"
        />
      </div>
    </div>
  );
}
