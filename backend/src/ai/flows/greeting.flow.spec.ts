/**
 * Unit tests for greeting.flow.ts
 *
 * Tests the greeting workflow that provides instant, friendly responses
 * without requiring LLM calls.
 */
import { createGreetingFlow } from './greeting.flow';
import { createMockToolsClient, createTestState } from '../test-utils';
import { AIMessage } from '@langchain/core/messages';
import { isGreeting } from '../nodes/router.node';

// Mock fleet overview response matching greeting flow's expected structure
// Note: These are RAW results (not wrapped in ToolResponse) because
// flow-utils.executeTool wraps them in { status: 'ok', result: ... }
const MOCK_GREETING_FLEET = {
  site: {
    totalLoggers: 3,
    onlineLoggers: 3,
    offlineLoggers: [],
    percentOnline: 100,
  },
  production: {
    currentPowerWatts: 15600,
    todayEnergyKwh: 85.2,
  },
  health: {
    overallScore: 95,
    status: 'healthy' as const,
  },
};

const MOCK_GREETING_FLEET_WARNING = {
  site: {
    totalLoggers: 3,
    onlineLoggers: 2,
    offlineLoggers: ['926'],
    percentOnline: 67,
  },
  production: {
    currentPowerWatts: 10400,
    todayEnergyKwh: 55.2,
  },
  health: {
    overallScore: 72,
    status: 'warning' as const,
  },
};

const MOCK_GREETING_FLEET_EMPTY = {
  site: {
    totalLoggers: 0,
    onlineLoggers: 0,
    offlineLoggers: [],
    percentOnline: 0,
  },
  production: {
    currentPowerWatts: 0,
    todayEnergyKwh: 0,
  },
  health: {
    overallScore: 0,
    status: 'healthy' as const,
  },
};

describe('GreetingFlow', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
    // Override fleet overview response for greeting-specific structure
    mockToolsClient.executeTool.mockImplementation((toolName: string) => {
      if (toolName === 'get_fleet_overview') {
        return Promise.resolve(MOCK_GREETING_FLEET);
      }
      return Promise.reject(new Error(`Unexpected tool call: ${toolName}`));
    });
  });

  describe('flow compilation', () => {
    it('should compile without errors', () => {
      const graph = createGreetingFlow(mockToolsClient as never);
      expect(graph).toBeDefined();
    });
  });

  describe('greeting generation', () => {
    it('should include Sunny persona in greeting', async () => {
      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      const result = await graph.invoke(initialState);

      // Should have an AI message
      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      expect(aiMessages.length).toBeGreaterThan(0);

      const content = aiMessages[0].content as string;
      expect(content).toContain('Sunny');
    });

    it('should include capability list', async () => {
      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      const result = await graph.invoke(initialState);

      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      const content = aiMessages[0].content as string;

      // Check for some capability keywords
      expect(content).toContain('solar production');
      expect(content).toContain('financial savings');
      expect(content).toContain('health');
    });

    it('should include fleet summary when data is available', async () => {
      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      const result = await graph.invoke(initialState);

      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      const content = aiMessages[0].content as string;

      expect(content).toContain('Quick check');
      expect(content).toContain('devices online');
    });

    it('should call get_fleet_overview for summary', async () => {
      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'get_fleet_overview',
        {},
      );
    });
  });

  describe('fleet overview handling', () => {
    it('should handle fleet overview failure gracefully', async () => {
      mockToolsClient.executeTool.mockRejectedValue(
        new Error('Connection failed'),
      );

      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      // Should not throw
      const result = await graph.invoke(initialState);

      // Should still have greeting without fleet summary
      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      expect(aiMessages.length).toBeGreaterThan(0);

      const content = aiMessages[0].content as string;
      expect(content).toContain('Sunny');
      // Should NOT have fleet summary
      expect(content).not.toContain('Quick check');
    });

    it('should handle empty fleet gracefully', async () => {
      mockToolsClient.executeTool.mockResolvedValue(MOCK_GREETING_FLEET_EMPTY);

      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      const result = await graph.invoke(initialState);

      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      const content = aiMessages[0].content as string;

      // Should have greeting but no fleet summary for empty fleet
      expect(content).toContain('Sunny');
      expect(content).not.toContain('Quick check');
    });

    it('should mention issues when fleet has warnings', async () => {
      mockToolsClient.executeTool.mockResolvedValue(
        MOCK_GREETING_FLEET_WARNING,
      );

      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      const result = await graph.invoke(initialState);

      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      const content = aiMessages[0].content as string;

      expect(content).toContain('Quick check');
      expect(content).toContain('worth checking');
    });
  });

  describe('time-aware greetings', () => {
    it('should use timezone from flow context', async () => {
      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {
          userTimezone: 'America/New_York',
        },
      });

      const result = await graph.invoke(initialState);

      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      const content = aiMessages[0].content as string;

      // Should have a time-based greeting (either "Good morning" or "Morning greetings")
      expect(content).toMatch(
        /(Good (morning|afternoon|evening)|(Morning|Afternoon|Evening) greetings)/i,
      );
    });

    it('should handle invalid timezone gracefully', async () => {
      const graph = createGreetingFlow(mockToolsClient as never);

      const initialState = createTestState({
        messages: [],
        flowContext: {
          userTimezone: 'Invalid/Timezone',
        },
      });

      // Should not throw
      const result = await graph.invoke(initialState);

      const aiMessages = result.messages.filter(
        (m: AIMessage) => m._getType() === 'ai',
      );
      expect(aiMessages.length).toBeGreaterThan(0);
    });
  });
});

describe('isGreeting detection', () => {
  describe('simple greetings', () => {
    it.each([
      'hi',
      'Hi',
      'HI',
      'hello',
      'Hello',
      'HELLO',
      'hey',
      'Hey',
      'hiya',
      'howdy',
      'greetings',
    ])('should detect "%s" as greeting', (message) => {
      expect(isGreeting(message)).toBe(true);
    });
  });

  describe('greetings with punctuation', () => {
    it.each([
      'Hello!',
      'Hi!',
      'Hey!',
      'Hello.',
      'Hi,',
      'hello!!',
      'hi!!!',
      'Hey!!!',
    ])('should detect "%s" as greeting', (message) => {
      expect(isGreeting(message)).toBe(true);
    });
  });

  describe('greetings with whitespace', () => {
    it.each([' hi ', '  hello  ', 'hi ', ' hello', 'hey   '])(
      'should detect "%s" as greeting',
      (message) => {
        expect(isGreeting(message)).toBe(true);
      },
    );
  });

  describe('time-based greetings', () => {
    it.each([
      'good morning',
      'Good morning',
      'Good Morning',
      'good afternoon',
      'Good afternoon',
      'good evening',
      'Good evening',
      'good day',
      'Good day',
      'good morning!',
      'Good evening!',
    ])('should detect "%s" as greeting', (message) => {
      expect(isGreeting(message)).toBe(true);
    });
  });

  describe('casual greetings', () => {
    it.each([
      "what's up",
      "What's up",
      "what's up?",
      'what is up',
      'yo',
      'Yo',
      'yo!',
      'sup',
      'Sup',
      'hey there',
      'Hi there',
      'hello there',
    ])('should detect "%s" as greeting', (message) => {
      expect(isGreeting(message)).toBe(true);
    });
  });

  describe('persona greetings', () => {
    it.each(['hello sunny', 'Hello Sunny', 'hi sunny', 'Hi Sunny'])(
      'should detect "%s" as greeting',
      (message) => {
        expect(isGreeting(message)).toBe(true);
      },
    );
  });

  describe('false positives (should NOT match)', () => {
    it.each([
      'Hello, check my system',
      'Hi, can you analyze inverter 925?',
      'Hey there, I need help with my panels',
      'Hello world',
      'hello how are you',
      'hi what can you do',
      'good morning briefing',
      'good morning, show me fleet status',
      'hi, give me a status report',
      'hello, I have a question',
      'sup with my inverter?',
    ])('should NOT detect "%s" as greeting', (message) => {
      expect(isGreeting(message)).toBe(false);
    });
  });
});
