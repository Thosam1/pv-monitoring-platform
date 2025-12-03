/**
 * Unit tests for the SSE Emitter.
 *
 * Tests the SSE event formatting helper that normalizes all LangGraph outputs
 * to SSE-compatible events for consistent streaming.
 */
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { SSEEmitter, SSEEvent } from './sse-emitter';

describe('SSEEmitter', () => {
  let emitter: SSEEmitter;
  let enqueuedData: Uint8Array[];
  let mockController: ReadableStreamDefaultController<Uint8Array>;

  beforeEach(() => {
    enqueuedData = [];
    mockController = {
      enqueue: jest.fn((data: Uint8Array) => {
        enqueuedData.push(data);
      }),
      close: jest.fn(),
      error: jest.fn(),
      desiredSize: 1,
    };
    emitter = new SSEEmitter(mockController);
  });

  /**
   * Helper to decode enqueued data and parse as SSE events.
   */
  function getEmittedEvents(): SSEEvent[] {
    const decoder = new TextDecoder();
    const events: SSEEvent[] = [];

    for (const data of enqueuedData) {
      const text = decoder.decode(data);
      // SSE format is "data: {...}\n\n"
      const match = text.match(/^data: (.+)\n\n$/);
      if (match) {
        events.push(JSON.parse(match[1]));
      }
    }

    return events;
  }

  describe('emitText', () => {
    it('should emit text-delta event with correct format', () => {
      emitter.emitText('Hello, world!');

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'text-delta',
        text: 'Hello, world!',
      });
    });

    it('should skip empty text', () => {
      emitter.emitText('');

      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should skip whitespace-only text', () => {
      emitter.emitText('   ');

      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should skip tab and newline only text', () => {
      emitter.emitText('\t\n  \n\t');

      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should emit text with leading/trailing whitespace', () => {
      emitter.emitText('  text with spaces  ');

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].text).toBe('  text with spaces  ');
    });

    it('should handle multiline text', () => {
      emitter.emitText('Line 1\nLine 2\nLine 3');

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].text).toBe('Line 1\nLine 2\nLine 3');
    });
  });

  describe('emitToolInput', () => {
    it('should emit tool-input-available with toolId, toolName, input', () => {
      emitter.emitToolInput('tool_123', 'analyze_health', { logger_id: '925' });

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool-input-available',
        toolId: 'tool_123',
        toolName: 'analyze_health',
        input: { logger_id: '925' },
      });
    });

    it('should handle complex input objects', () => {
      const complexInput = {
        logger_ids: ['925', '926'],
        date_range: { start: '2025-01-01', end: '2025-01-10' },
        options: { includeMetadata: true },
      };

      emitter.emitToolInput('tool_456', 'compare_loggers', complexInput);

      const events = getEmittedEvents();
      expect(events[0].input).toEqual(complexInput);
    });

    it('should handle empty input', () => {
      emitter.emitToolInput('tool_789', 'list_loggers', {});

      const events = getEmittedEvents();
      expect(events[0].input).toEqual({});
    });

    it('should handle null and undefined in input', () => {
      emitter.emitToolInput('tool_abc', 'test_tool', {
        required: 'value',
        optional: null,
        missing: undefined,
      });

      const events = getEmittedEvents();
      expect(events[0].input).toEqual({
        required: 'value',
        optional: null,
      });
    });
  });

  describe('emitToolOutput', () => {
    it('should emit tool-output-available with toolId, toolName, output', () => {
      const output = {
        status: 'ok',
        result: { healthScore: 95 },
      };

      emitter.emitToolOutput('tool_123', 'analyze_health', output);

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'tool-output-available',
        toolId: 'tool_123',
        toolName: 'analyze_health',
        output,
      });
    });

    it('should handle array output', () => {
      const output = {
        loggers: [
          { loggerId: '925', type: 'goodwe' },
          { loggerId: '926', type: 'lti' },
        ],
      };

      emitter.emitToolOutput('tool_456', 'list_loggers', output);

      const events = getEmittedEvents();
      expect(events[0].output).toEqual(output);
    });

    it('should handle nested objects in output', () => {
      const output = {
        component: 'HealthReport',
        props: {
          anomalies: [{ type: 'outage', severity: 'high' }],
          summary: {
            healthScore: 78,
            trend: 'declining',
          },
        },
      };

      emitter.emitToolOutput('tool_789', 'render_ui_component', output);

      const events = getEmittedEvents();
      expect(events[0].output).toEqual(output);
    });
  });

  describe('emitError', () => {
    it('should emit error event with message', () => {
      emitter.emitError('Connection failed');

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'error',
        text: 'Connection failed',
      });
    });

    it('should handle long error messages', () => {
      const longError = 'A'.repeat(1000);
      emitter.emitError(longError);

      const events = getEmittedEvents();
      expect(events[0].text).toBe(longError);
    });

    it('should handle error messages with special characters', () => {
      emitter.emitError('Error: Invalid JSON at line 5, column 10');

      const events = getEmittedEvents();
      expect(events[0].text).toBe('Error: Invalid JSON at line 5, column 10');
    });
  });

  describe('emitFromMessages', () => {
    it('should extract text from AIMessage with string content', () => {
      const messages = [new AIMessage({ content: 'Hello from AI!' })];

      emitter.emitFromMessages(messages);

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: 'text-delta',
        text: 'Hello from AI!',
      });
    });

    it('should extract text from AIMessage with array content', () => {
      const messages = [
        new AIMessage({
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
          ],
        }),
      ];

      emitter.emitFromMessages(messages);

      const events = getEmittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0].text).toBe('Part 1');
      expect(events[1].text).toBe('Part 2');
    });

    it('should skip non-AI messages', () => {
      const messages = [
        new HumanMessage({ content: 'User message' }),
        new SystemMessage({ content: 'System message' }),
        new AIMessage({ content: 'AI message' }),
      ];

      emitter.emitFromMessages(messages);

      const events = getEmittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].text).toBe('AI message');
    });

    it('should handle empty messages array', () => {
      emitter.emitFromMessages([]);

      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should handle empty content arrays', () => {
      const messages = [new AIMessage({ content: [] })];

      emitter.emitFromMessages(messages);

      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should skip non-text parts in array content', () => {
      const messages = [
        new AIMessage({
          content: [
            { type: 'text', text: 'Valid text' },
            { type: 'image', url: 'http://example.com/image.png' } as unknown,
            { type: 'text', text: 'More text' },
          ],
        }),
      ];

      emitter.emitFromMessages(messages);

      const events = getEmittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0].text).toBe('Valid text');
      expect(events[1].text).toBe('More text');
    });

    it('should handle AIMessage with empty string content', () => {
      const messages = [new AIMessage({ content: '' })];

      emitter.emitFromMessages(messages);

      expect(mockController.enqueue).not.toHaveBeenCalled();
    });

    it('should handle multiple AI messages', () => {
      const messages = [
        new AIMessage({ content: 'First response' }),
        new AIMessage({ content: 'Second response' }),
      ];

      emitter.emitFromMessages(messages);

      const events = getEmittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0].text).toBe('First response');
      expect(events[1].text).toBe('Second response');
    });
  });

  describe('event encoding', () => {
    it('should encode event as "data: {...}\\n\\n" format', () => {
      emitter.emitText('Test');

      const decoder = new TextDecoder();
      const text = decoder.decode(enqueuedData[0]);

      expect(text).toMatch(/^data: .+\n\n$/);
      expect(text).toBe('data: {"type":"text-delta","text":"Test"}\n\n');
    });

    it('should properly escape special characters in JSON', () => {
      emitter.emitText('Quote: "hello" and backslash: \\');

      const decoder = new TextDecoder();
      const text = decoder.decode(enqueuedData[0]);

      // Parse the JSON to ensure it's valid
      const jsonMatch = text.match(/^data: (.+)\n\n$/);
      expect(jsonMatch).not.toBeNull();
      const parsed = JSON.parse(jsonMatch![1]);
      expect(parsed.text).toBe('Quote: "hello" and backslash: \\');
    });

    it('should handle unicode characters', () => {
      emitter.emitText('Unicode: 你好世界 🌍');

      const events = getEmittedEvents();
      expect(events[0].text).toBe('Unicode: 你好世界 🌍');
    });
  });

  describe('sequential emissions', () => {
    it('should maintain order of multiple emissions', () => {
      emitter.emitText('Step 1');
      emitter.emitToolInput('tool_1', 'tool_a', { step: 1 });
      emitter.emitText('Step 2');
      emitter.emitToolOutput('tool_1', 'tool_a', { result: 'done' });

      const events = getEmittedEvents();
      expect(events).toHaveLength(4);
      expect(events[0].type).toBe('text-delta');
      expect(events[1].type).toBe('tool-input-available');
      expect(events[2].type).toBe('text-delta');
      expect(events[3].type).toBe('tool-output-available');
    });
  });
});
