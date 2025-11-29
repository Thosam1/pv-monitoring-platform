/**
 * Tool invocation result from the AI.
 */
export interface ToolInvocation {
  toolName: string;
  toolCallId: string;
  state: 'call' | 'result';
  args?: Record<string, unknown>;
  result?: unknown;
}

/**
 * Response message from the AI chat.
 */
export interface ChatResponseMessage {
  role: 'assistant';
  content: string;
  toolInvocations?: ToolInvocation[];
}

/**
 * Streaming chunk for SSE response.
 */
export interface StreamChunk {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish';
  textDelta?: string;
  toolCall?: {
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  };
  toolResult?: {
    toolCallId: string;
    result: unknown;
  };
  finishReason?: 'stop' | 'tool-calls' | 'error';
}
