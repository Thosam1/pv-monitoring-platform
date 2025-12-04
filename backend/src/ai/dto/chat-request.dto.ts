/**
 * Represents a single message in the chat conversation.
 */
export class ChatMessageDto {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Request DTO for the AI chat endpoint.
 * Contains the conversation history as an array of messages.
 */
export class ChatRequestDto {
  messages: ChatMessageDto[];

  /**
   * Optional thread ID for state persistence across invocations.
   * When provided, the LangGraph checkpointer will save and restore
   * graph state, enabling multi-turn flows with user selections.
   */
  threadId?: string;
}
