/**
 * SSE Emitter Helper
 *
 * Normalizes all LangGraph outputs → SSE events for consistent streaming.
 * Handles:
 * - LLM text deltas
 * - Tool input/output events
 * - Flow messages (AIMessage with text content)
 * - Multi-part content arrays from LangChain
 */

import { BaseMessage } from '@langchain/core/messages';

export interface SSEEvent {
  type:
    | 'text-delta'
    | 'tool-input-available'
    | 'tool-output-available'
    | 'thinking' // Fix #7: Loading feedback during heavy operations
    | 'error';
  text?: string;
  toolId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

export class SSEEmitter {
  private encoder = new TextEncoder();
  private controller: ReadableStreamDefaultController<Uint8Array>;

  constructor(controller: ReadableStreamDefaultController<Uint8Array>) {
    this.controller = controller;
  }

  /** Emit a text delta event */
  emitText(text: string): void {
    if (!text.trim()) return;
    this.emit({ type: 'text-delta', text });
  }

  /** Emit tool input event */
  emitToolInput(toolId: string, toolName: string, input: unknown): void {
    this.emit({ type: 'tool-input-available', toolId, toolName, input });
  }

  /** Emit tool output event */
  emitToolOutput(toolId: string, toolName: string, output: unknown): void {
    this.emit({ type: 'tool-output-available', toolId, toolName, output });
  }

  /** Emit error event */
  emitError(message: string): void {
    this.emit({ type: 'error', text: message });
  }

  /**
   * Emit a thinking/loading message for user feedback during heavy operations.
   * Fix #7: Provides intermediate feedback while tools execute.
   *
   * @param message - The thinking message to display (e.g., "Checking your fleet status...")
   */
  emitThinking(message: string): void {
    if (!message.trim()) return;
    this.emit({ type: 'thinking', text: message });
  }

  /**
   * Extract and emit text from AIMessage array.
   * Handles both plain string content and multi-part content arrays.
   *
   * Supported formats:
   * - { content: "hello" }
   * - { content: [{ type: 'text', text: 'hello' }] }
   */
  emitFromMessages(messages: BaseMessage[]): void {
    for (const msg of messages) {
      if (msg._getType() !== 'ai') continue;

      // Handle plain string content
      if (typeof msg.content === 'string') {
        this.emitText(msg.content);
      }
      // Handle multi-part content: [{ type: 'text', text: '...' }]
      else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (
            typeof part === 'object' &&
            part !== null &&
            'type' in part &&
            part.type === 'text' &&
            'text' in part &&
            typeof part.text === 'string'
          ) {
            this.emitText(part.text);
          }
        }
      }
    }
  }

  private emit(event: SSEEvent): void {
    this.controller.enqueue(
      this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
    );
  }
}
