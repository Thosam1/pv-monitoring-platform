/**
 * SSE Event Capture utilities for testing.
 *
 * Provides tools for capturing and analyzing SSE events from the
 * LanggraphService streamChat method.
 */

/**
 * Captured text-delta event.
 */
export interface CapturedTextDelta {
  delta: string;
  timestamp: number;
}

/**
 * Captured tool-input-available event.
 */
export interface CapturedToolInput {
  toolCallId: string;
  toolName: string;
  input: unknown;
  timestamp: number;
}

/**
 * Captured tool-output-available event.
 */
export interface CapturedToolOutput {
  toolCallId: string;
  output: unknown;
  timestamp: number;
}

/**
 * Captured error event.
 */
export interface CapturedError {
  text: string;
  timestamp: number;
}

/**
 * All captured events organized by type.
 */
export interface CapturedEvents {
  /** Text delta events */
  textDeltas: CapturedTextDelta[];
  /** Tool input events */
  toolInputs: CapturedToolInput[];
  /** Tool output events */
  toolOutputs: CapturedToolOutput[];
  /** Error events */
  errors: CapturedError[];
  /** All events in order */
  all: SSEEvent[];
  /** Total event count */
  totalCount: number;
}

/**
 * Generic SSE event structure.
 */
export interface SSEEvent {
  type: string;
  delta?: string;
  text?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  [key: string]: unknown;
}

/**
 * Event capture instance for collecting and analyzing events.
 */
export interface EventCapture {
  /** Add an event to the capture */
  addEvent(event: unknown): void;
  /** Get the captured events result */
  getResult(): CapturedEvents;
  /** Clear all captured events */
  clear(): void;
}

/**
 * Create an event capture instance.
 *
 * @returns EventCapture instance
 *
 * @example
 * ```typescript
 * const capture = createEventCapture();
 * for await (const event of service.streamChat(messages)) {
 *   capture.addEvent(event);
 * }
 * const result = capture.getResult();
 * expect(result.textDeltas).toHaveLength(1);
 * ```
 */
export function createEventCapture(): EventCapture {
  const textDeltas: CapturedTextDelta[] = [];
  const toolInputs: CapturedToolInput[] = [];
  const toolOutputs: CapturedToolOutput[] = [];
  const errors: CapturedError[] = [];
  const all: SSEEvent[] = [];

  return {
    addEvent(event: unknown): void {
      const sseEvent = event as SSEEvent;
      const timestamp = Date.now();
      all.push(sseEvent);

      switch (sseEvent.type) {
        case 'text-delta':
          if (sseEvent.delta) {
            textDeltas.push({ delta: sseEvent.delta, timestamp });
          }
          break;

        case 'tool-input-available':
          if (sseEvent.toolCallId && sseEvent.toolName) {
            toolInputs.push({
              toolCallId: sseEvent.toolCallId,
              toolName: sseEvent.toolName,
              input: sseEvent.input,
              timestamp,
            });
          }
          break;

        case 'tool-output-available':
          if (sseEvent.toolCallId) {
            toolOutputs.push({
              toolCallId: sseEvent.toolCallId,
              output: sseEvent.output,
              timestamp,
            });
          }
          break;

        case 'error':
          if (sseEvent.text) {
            errors.push({ text: sseEvent.text, timestamp });
          }
          break;
      }
    },

    getResult(): CapturedEvents {
      return {
        textDeltas: [...textDeltas],
        toolInputs: [...toolInputs],
        toolOutputs: [...toolOutputs],
        errors: [...errors],
        all: [...all],
        totalCount: all.length,
      };
    },

    clear(): void {
      textDeltas.length = 0;
      toolInputs.length = 0;
      toolOutputs.length = 0;
      errors.length = 0;
      all.length = 0;
    },
  };
}

/**
 * Capture all events from an async generator.
 *
 * @param stream - Async generator from streamChat
 * @param options - Configuration options
 * @returns CapturedEvents
 *
 * @example
 * ```typescript
 * const events = await captureAllEvents(service.streamChat(messages));
 * expect(events.totalCount).toBeGreaterThan(0);
 * ```
 */
export async function captureAllEvents(
  stream: AsyncIterable<unknown>,
  options: { maxEvents?: number; timeoutMs?: number } = {},
): Promise<CapturedEvents> {
  const { maxEvents = 100, timeoutMs = 30000 } = options;

  const capture = createEventCapture();
  const startTime = Date.now();

  try {
    let count = 0;
    for await (const event of stream) {
      capture.addEvent(event);
      count++;

      if (count >= maxEvents) break;
      if (Date.now() - startTime > timeoutMs) break;
    }
  } catch {
    // Stream ended, possibly with error - that's ok for testing
  }

  return capture.getResult();
}

/**
 * Find events matching a predicate.
 *
 * @param events - Captured events
 * @param predicate - Function to filter events
 * @returns Matching events
 */
export function findEvents(
  events: CapturedEvents,
  predicate: (event: SSEEvent) => boolean,
): SSEEvent[] {
  return events.all.filter(predicate);
}

/**
 * Check if events contain a specific tool call.
 *
 * @param events - Captured events
 * @param toolName - Tool name to check
 * @returns True if tool was called
 */
export function hasToolCall(events: CapturedEvents, toolName: string): boolean {
  return events.toolInputs.some((e) => e.toolName === toolName);
}

/**
 * Get tool calls for a specific tool name.
 *
 * @param events - Captured events
 * @param toolName - Tool name to filter
 * @returns Array of matching tool inputs
 */
export function getToolCalls(
  events: CapturedEvents,
  toolName: string,
): CapturedToolInput[] {
  return events.toolInputs.filter((e) => e.toolName === toolName);
}

/**
 * Get the concatenated text from all text-delta events.
 *
 * @param events - Captured events
 * @returns Full text content
 */
export function getConcatenatedText(events: CapturedEvents): string {
  return events.textDeltas.map((e) => e.delta).join('');
}

/**
 * Check for duplicate toolCallIds in events.
 *
 * @param events - Captured events
 * @returns Array of duplicate IDs
 */
export function findDuplicateToolCallIds(events: CapturedEvents): string[] {
  const seenInputs = new Set<string>();
  const seenOutputs = new Set<string>();
  const duplicates: string[] = [];

  for (const input of events.toolInputs) {
    if (seenInputs.has(input.toolCallId)) {
      duplicates.push(`input:${input.toolCallId}`);
    }
    seenInputs.add(input.toolCallId);
  }

  for (const output of events.toolOutputs) {
    if (seenOutputs.has(output.toolCallId)) {
      duplicates.push(`output:${output.toolCallId}`);
    }
    seenOutputs.add(output.toolCallId);
  }

  return duplicates;
}

/**
 * Assert that tool input comes before output for each tool call.
 *
 * @param events - Captured events
 * @returns True if ordering is correct
 */
export function verifyToolEventOrdering(events: CapturedEvents): boolean {
  const inputTimestamps = new Map<string, number>();

  for (const input of events.toolInputs) {
    inputTimestamps.set(input.toolCallId, input.timestamp);
  }

  for (const output of events.toolOutputs) {
    const inputTime = inputTimestamps.get(output.toolCallId);
    if (inputTime !== undefined && output.timestamp < inputTime) {
      return false;
    }
  }

  return true;
}
