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
}
