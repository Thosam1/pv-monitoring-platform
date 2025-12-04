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
 * Accepts undefined to handle .at(-1) return type safely.
 */
export function isAiMessage(msg: BaseMessage | undefined): msg is AIMessage {
  return msg !== undefined && msg instanceof AIMessage;
}

/**
 * Type guard to check if a message is a HumanMessage.
 * Accepts undefined to handle .at(-1) return type safely.
 */
export function isHumanMessage(
  msg: BaseMessage | undefined,
): msg is HumanMessage {
  return msg !== undefined && msg instanceof HumanMessage;
}

/**
 * Type guard to check if a message is a SystemMessage.
 * Accepts undefined to handle .at(-1) return type safely.
 */
export function isSystemMessage(
  msg: BaseMessage | undefined,
): msg is SystemMessage {
  return msg !== undefined && msg instanceof SystemMessage;
}

/**
 * Type guard to check if a message is a ToolMessage.
 * Accepts undefined to handle .at(-1) return type safely.
 */
export function isToolMessage(
  msg: BaseMessage | undefined,
): msg is ToolMessage {
  return msg !== undefined && msg instanceof ToolMessage;
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
