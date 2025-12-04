import { useState, useCallback, useEffect } from 'react';
import type { Message, ChatPart } from '@/components/ai/chat-interface';

const STORAGE_KEY = 'solar-analyst-chats';

export interface ChatConversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate a unique ID for chat conversations.
 */
function generateId(): string {
  return `chat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Extract title from the first user message or use default.
 */
function extractTitle(messages: Message[]): string {
  const firstUserMessage = messages.find((m) => m.role === 'user');
  if (firstUserMessage) {
    // Find text content
    const textPart = firstUserMessage.parts.find((p): p is ChatPart & { type: 'text'; text: string } => p.type === 'text');
    if (textPart && textPart.text) {
      const text = textPart.text;
      return text.length > 50 ? `${text.substring(0, 50)}...` : text;
    }
  }
  return 'New Chat';
}

/**
 * Load conversations from localStorage.
 */
function loadConversations(): ChatConversation[] {
  if (typeof globalThis.window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Save conversations to localStorage.
 */
function saveConversations(conversations: ChatConversation[]): void {
  if (typeof globalThis.window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch (error) {
    console.error('Failed to save conversations to localStorage:', error);
  }
}

/**
 * Hook for managing AI chat state with localStorage persistence.
 */
export function useAIChat() {
  // Initialize from localStorage synchronously
  const [conversations, setConversations] = useState<ChatConversation[]>(() => loadConversations());
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const isInitialized = true;

  // Save conversations when they change
  useEffect(() => {
    if (isInitialized) {
      saveConversations(conversations);
    }
  }, [conversations, isInitialized]);

  // Get current conversation
  const currentConversation = conversations.find((c) => c.id === currentChatId);
  const currentMessages = currentConversation?.messages || [];

  // Create a new chat
  const createNewChat = useCallback(() => {
    const id = generateId();
    const newConversation: ChatConversation = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setConversations((prev) => [newConversation, ...prev]);
    setCurrentChatId(id);
    return id;
  }, []);

  // Select a chat
  const selectChat = useCallback((id: string) => {
    setCurrentChatId(id);
  }, []);

  // Delete a chat
  const deleteChat = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (currentChatId === id) {
        setCurrentChatId(null);
      }
    },
    [currentChatId]
  );

  // Update messages for current chat
  const updateMessages = useCallback(
    (messages: Message[]) => {
      if (!currentChatId) return;

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id === currentChatId) {
            return {
              ...conv,
              messages,
              title: extractTitle(messages),
              updatedAt: new Date().toISOString(),
            };
          }
          return conv;
        })
      );
    },
    [currentChatId]
  );

  // Start a new chat if none exists when user sends first message
  const ensureChat = useCallback(() => {
    if (!currentChatId) {
      return createNewChat();
    }
    return currentChatId;
  }, [currentChatId, createNewChat]);

  return {
    conversations,
    currentChatId,
    currentMessages,
    createNewChat,
    selectChat,
    deleteChat,
    updateMessages,
    ensureChat,
    isInitialized,
  };
}
