/**
 * Type guard utilities for LangChain messages.
 * Replaces deprecated _getType() calls with instanceof checks.
 */
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';

/**
 * Type guard to check if a message is an AIMessage.
 */
export function isAiMessage(msg: BaseMessage): msg is AIMessage {
  return msg instanceof AIMessage;
}

/**
 * Type guard to check if a message is a HumanMessage.
 */
export function isHumanMessage(msg: BaseMessage): msg is HumanMessage {
  return msg instanceof HumanMessage;
}

/**
 * Type guard to check if a message is a SystemMessage.
 */
export function isSystemMessage(msg: BaseMessage): msg is SystemMessage {
  return msg instanceof SystemMessage;
}

/**
 * Type guard to check if a message is a ToolMessage.
 */
export function isToolMessage(msg: BaseMessage): msg is ToolMessage {
  return msg instanceof ToolMessage;
}

/**
 * Gets the message type as a string (for logging/debugging only).
 * Prefer using the type guards above for logic checks.
 */
export function getMessageType(msg: BaseMessage): string {
  if (msg instanceof AIMessage) return 'ai';
  if (msg instanceof HumanMessage) return 'human';
  if (msg instanceof SystemMessage) return 'system';
  if (msg instanceof ToolMessage) return 'tool';
  return 'unknown';
}
