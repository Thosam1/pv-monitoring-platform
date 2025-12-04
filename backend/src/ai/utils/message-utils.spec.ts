/**
 * Unit tests for message-utils.ts
 *
 * Tests type guard utilities for LangChain messages.
 */
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  isAiMessage,
  isHumanMessage,
  isSystemMessage,
  isToolMessage,
  getMessageType,
} from './message-utils';

describe('Message Utils', () => {
  describe('isAiMessage', () => {
    it('should return true for AIMessage', () => {
      const msg = new AIMessage('Hello');
      expect(isAiMessage(msg)).toBe(true);
    });

    it('should return false for HumanMessage', () => {
      const msg = new HumanMessage('Hello');
      expect(isAiMessage(msg)).toBe(false);
    });

    it('should return false for SystemMessage', () => {
      const msg = new SystemMessage('System prompt');
      expect(isAiMessage(msg)).toBe(false);
    });

    it('should return false for ToolMessage', () => {
      const msg = new ToolMessage({
        content: 'Result',
        tool_call_id: 'call_123',
      });
      expect(isAiMessage(msg)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAiMessage(undefined)).toBe(false);
    });

    it('should return false for null coerced to undefined', () => {
      expect(isAiMessage(null as unknown as undefined)).toBe(false);
    });

    it('should handle AIMessage with tool_calls', () => {
      const msg = new AIMessage({
        content: '',
        tool_calls: [{ id: 'call_123', name: 'test', args: {} }],
      });
      expect(isAiMessage(msg)).toBe(true);
    });
  });

  describe('isHumanMessage', () => {
    it('should return true for HumanMessage', () => {
      const msg = new HumanMessage('Hello');
      expect(isHumanMessage(msg)).toBe(true);
    });

    it('should return false for AIMessage', () => {
      const msg = new AIMessage('Hello');
      expect(isHumanMessage(msg)).toBe(false);
    });

    it('should return false for SystemMessage', () => {
      const msg = new SystemMessage('System prompt');
      expect(isHumanMessage(msg)).toBe(false);
    });

    it('should return false for ToolMessage', () => {
      const msg = new ToolMessage({
        content: 'Result',
        tool_call_id: 'call_123',
      });
      expect(isHumanMessage(msg)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isHumanMessage(undefined)).toBe(false);
    });

    it('should handle HumanMessage with array content', () => {
      const msg = new HumanMessage({
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'text', text: 'World' },
        ],
      });
      expect(isHumanMessage(msg)).toBe(true);
    });
  });

  describe('isSystemMessage', () => {
    it('should return true for SystemMessage', () => {
      const msg = new SystemMessage('System prompt');
      expect(isSystemMessage(msg)).toBe(true);
    });

    it('should return false for AIMessage', () => {
      const msg = new AIMessage('Hello');
      expect(isSystemMessage(msg)).toBe(false);
    });

    it('should return false for HumanMessage', () => {
      const msg = new HumanMessage('Hello');
      expect(isSystemMessage(msg)).toBe(false);
    });

    it('should return false for ToolMessage', () => {
      const msg = new ToolMessage({
        content: 'Result',
        tool_call_id: 'call_123',
      });
      expect(isSystemMessage(msg)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSystemMessage(undefined)).toBe(false);
    });
  });

  describe('isToolMessage', () => {
    it('should return true for ToolMessage', () => {
      const msg = new ToolMessage({
        content: 'Result',
        tool_call_id: 'call_123',
      });
      expect(isToolMessage(msg)).toBe(true);
    });

    it('should return false for AIMessage', () => {
      const msg = new AIMessage('Hello');
      expect(isToolMessage(msg)).toBe(false);
    });

    it('should return false for HumanMessage', () => {
      const msg = new HumanMessage('Hello');
      expect(isToolMessage(msg)).toBe(false);
    });

    it('should return false for SystemMessage', () => {
      const msg = new SystemMessage('System prompt');
      expect(isToolMessage(msg)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isToolMessage(undefined)).toBe(false);
    });

    it('should handle ToolMessage with JSON content', () => {
      const msg = new ToolMessage({
        content: JSON.stringify({ status: 'ok', result: {} }),
        tool_call_id: 'call_123',
        name: 'list_loggers',
      });
      expect(isToolMessage(msg)).toBe(true);
    });
  });

  describe('getMessageType', () => {
    it('should return "ai" for AIMessage', () => {
      const msg = new AIMessage('Hello');
      expect(getMessageType(msg)).toBe('ai');
    });

    it('should return "human" for HumanMessage', () => {
      const msg = new HumanMessage('Hello');
      expect(getMessageType(msg)).toBe('human');
    });

    it('should return "system" for SystemMessage', () => {
      const msg = new SystemMessage('System prompt');
      expect(getMessageType(msg)).toBe('system');
    });

    it('should return "tool" for ToolMessage', () => {
      const msg = new ToolMessage({
        content: 'Result',
        tool_call_id: 'call_123',
      });
      expect(getMessageType(msg)).toBe('tool');
    });

    it('should return "unknown" for other message types', () => {
      // Create a mock message that doesn't match any known type
      const mockMsg = {
        content: 'test',
        _getType: () => 'custom',
      };
      // Force type to BaseMessage for testing
      expect(
        getMessageType(
          mockMsg as unknown as Parameters<typeof getMessageType>[0],
        ),
      ).toBe('unknown');
    });
  });

  describe('type narrowing', () => {
    it('should allow access to AIMessage properties after type guard', () => {
      const msg = new AIMessage({
        content: 'Hello',
        tool_calls: [{ id: 'call_1', name: 'test', args: {} }],
      });

      if (isAiMessage(msg)) {
        // TypeScript should allow accessing tool_calls here
        expect(msg.tool_calls).toBeDefined();
        expect(msg.tool_calls?.length).toBe(1);
      }
    });

    it('should allow access to ToolMessage properties after type guard', () => {
      const msg = new ToolMessage({
        content: 'Result',
        tool_call_id: 'call_123',
        name: 'list_loggers',
      });

      if (isToolMessage(msg)) {
        // TypeScript should allow accessing tool_call_id here
        expect(msg.tool_call_id).toBe('call_123');
        expect(msg.name).toBe('list_loggers');
      }
    });

    it('should work with array.at() return type', () => {
      const messages = [new HumanMessage('First'), new AIMessage('Response')];

      const lastMsg = messages.at(-1);
      // at() returns T | undefined, so type guard handles it
      if (isAiMessage(lastMsg)) {
        expect(lastMsg.content).toBe('Response');
      }
    });

    it('should work in filter operations', () => {
      const messages = [
        new HumanMessage('Q1'),
        new AIMessage('A1'),
        new HumanMessage('Q2'),
        new AIMessage('A2'),
      ];

      const aiMessages = messages.filter(isAiMessage);
      expect(aiMessages).toHaveLength(2);
      aiMessages.forEach((msg) => {
        expect(msg instanceof AIMessage).toBe(true);
      });
    });
  });
});
