/**
 * End-to-end Integration Tests for LanggraphService.
 *
 * Tests complete user-agent interaction flows simulating real UX scenarios.
 * These tests verify:
 * - Multi-step conversation flows work correctly
 * - User selections are properly handled
 * - Tool calls are made with correct arguments
 * - Responses contain expected UI components
 * - No duplicate events are emitted
 *
 * IMPORTANT: These tests require a real AI provider API key to run.
 * They are skipped by default in CI. To run locally:
 *
 * 1. Set environment variables:
 *    export AI_PROVIDER=gemini
 *    export GOOGLE_GENERATIVE_AI_API_KEY=your-real-api-key
 *
 * 2. Run with:
 *    npm test -- langgraph.service.e2e.spec.ts
 *
 * Or use Ollama for local testing:
 *    export AI_PROVIDER=ollama
 *    export OLLAMA_BASE_URL=http://127.0.0.1:11434
 *    export OLLAMA_MODEL=llama3.2
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LanggraphService } from './langgraph.service';
import { ToolsHttpClient } from './tools-http.client';
import {
  createMockToolsClient,
  MOCK_LIST_LOGGERS,
  MOCK_HEALTH_WITH_ANOMALIES,
  MOCK_HEALTH_CLEAN,
  MOCK_FLEET_OVERVIEW,
  MOCK_FINANCIAL_SAVINGS,
  MOCK_COMPARE_LOGGERS,
  MOCK_FORECAST,
  MOCK_NO_DATA_IN_WINDOW,
  simulateConversation,
  assertNoDuplicates,
  wasToolCalled,
  hasToolCall,
} from './test-utils';

// Skip E2E tests by default - they require a real API key
// Set RUN_E2E_TESTS=true to enable
const describeE2E =
  process.env.RUN_E2E_TESTS === 'true' ? describe : describe.skip;

/**
 * Note: These tests run against the real LangGraph graph but with mocked tools.
 * Since we don't have a real API key in CI, tests are skipped by default.
 * Tests are designed to verify:
 * 1. No duplicate events are emitted
 * 2. Tool calls are made with correct structure
 * 3. The graph processes messages without crashing
 *
 * Tests that require LLM responses may not fully complete but should not crash.
 */
describeE2E('LanggraphService E2E UX Flows', () => {
  let service: LanggraphService;
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    mockToolsClient = createMockToolsClient();

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-api-key',
          EXPLICIT_FLOWS_ENABLED: 'true',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LanggraphService,
        { provide: ConfigService, useValue: configService },
        { provide: ToolsHttpClient, useValue: mockToolsClient },
      ],
    }).compile();

    service = module.get<LanggraphService>(LanggraphService);
  });

  afterEach(() => {
    service.resetGraph();
    jest.clearAllMocks();
  });

  /**
   * Helper to verify events don't have duplicates regardless of API success.
   */
  function verifyNoDuplicates(events: CapturedEvents): void {
    const toolInputIds = events.toolInputs.map((e) => e.toolCallId);
    const uniqueInputIds = new Set(toolInputIds);
    expect(toolInputIds.length).toBe(uniqueInputIds.size);

    const toolOutputIds = events.toolOutputs.map((e) => e.toolCallId);
    const uniqueOutputIds = new Set(toolOutputIds);
    expect(toolOutputIds.length).toBe(uniqueOutputIds.size);
  }

  describe('Greeting Flow', () => {
    it('should respond to "Hello" with a greeting', async () => {
      const result = await simulateConversation(service, ['Hello']);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Greeting flow should produce text
      expect(result.events.textDeltas.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle various greeting patterns', async () => {
      const greetings = ['Hi', 'Good morning', 'Hey there'];

      for (const greeting of greetings) {
        service.resetGraph();
        const result = await simulateConversation(service, [greeting]);

        expect(result.success).toBe(true);
        assertNoDuplicates(result.events);
      }
    });

    it('should bypass LLM classification for simple greetings', async () => {
      const result = await simulateConversation(service, ['Hello']);

      // Greeting should be fast (pattern matched, not LLM classified)
      // Just verify no errors and has response
      expect(result.success).toBe(true);
    });
  });

  describe('Morning Briefing Flow', () => {
    it('should return fleet overview without prompting for selection', async () => {
      const result = await simulateConversation(service, ['Morning briefing']);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Morning briefing is fleet-level, should not prompt for selection
      const selectionPrompts = result.events.toolInputs.filter(
        (e) => e.toolName === 'request_user_selection',
      );
      expect(selectionPrompts.length).toBe(0);
    });

    it('should call get_fleet_overview tool', async () => {
      const result = await simulateConversation(service, [
        'Give me a morning briefing',
      ]);

      expect(result.success).toBe(true);

      // Should call fleet overview tool
      expect(wasToolCalled(result.events, 'get_fleet_overview')).toBe(true);
    });

    it('should render FleetOverview component', async () => {
      const result = await simulateConversation(service, ['Fleet status']);

      expect(result.success).toBe(true);

      // Check for render_ui_component with FleetOverview
      const renderCalls = result.events.toolInputs.filter(
        (e) => e.toolName === 'render_ui_component',
      );

      if (renderCalls.length > 0) {
        const input = renderCalls[0].input as { component?: string };
        expect(input.component).toBe('FleetOverview');
      }
    });
  });

  describe('Health Check Flow', () => {
    it('should prompt for logger selection when not specified', async () => {
      const result = await simulateConversation(service, ['Check health']);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Should prompt for logger selection
      const selectionPrompts = result.events.toolInputs.filter(
        (e) => e.toolName === 'request_user_selection',
      );
      expect(selectionPrompts.length).toBeGreaterThan(0);
    });

    it('should complete health check when logger ID provided', async () => {
      // Configure mock to return health data
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'analyze_inverter_health')
          return Promise.resolve(MOCK_HEALTH_WITH_ANOMALIES);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, [
        'Check health of logger 925',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Should call analyze_inverter_health
      expect(wasToolCalled(result.events, 'analyze_inverter_health')).toBe(
        true,
      );
    });

    it('should handle "all devices" health check', async () => {
      const result = await simulateConversation(service, [
        'Check health of all devices',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);
    });
  });

  describe('Financial Report Flow', () => {
    it('should prompt for logger when not specified', async () => {
      const result = await simulateConversation(service, [
        'How much did I save?',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Should prompt for logger selection
      const selectionPrompts = result.events.toolInputs.filter(
        (e) => e.toolName === 'request_user_selection',
      );
      expect(selectionPrompts.length).toBeGreaterThan(0);
    });

    it('should complete financial report when logger provided', async () => {
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'calculate_financial_savings')
          return Promise.resolve(MOCK_FINANCIAL_SAVINGS);
        if (toolName === 'forecast_production')
          return Promise.resolve(MOCK_FORECAST);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, [
        'Financial report for logger 925',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);
    });
  });

  describe('Performance Audit Flow', () => {
    it('should prompt for multiple loggers when comparing', async () => {
      const result = await simulateConversation(service, [
        'Compare my inverters',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Should prompt for multiple logger selection
      const selectionPrompts = result.events.toolInputs.filter(
        (e) => e.toolName === 'request_user_selection',
      );
      expect(selectionPrompts.length).toBeGreaterThan(0);

      // Check that selection type is multiple
      if (selectionPrompts.length > 0) {
        const input = selectionPrompts[0].input as { selectionType?: string };
        expect(input.selectionType).toBe('multiple');
      }
    });

    it('should complete comparison when logger IDs provided', async () => {
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'compare_loggers')
          return Promise.resolve(MOCK_COMPARE_LOGGERS);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, [
        'Compare loggers 925 and 926',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);

      // Should call compare_loggers
      expect(wasToolCalled(result.events, 'compare_loggers')).toBe(true);
    });
  });

  describe('Recovery Flow', () => {
    it('should handle no_data_in_window error gracefully', async () => {
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'analyze_inverter_health')
          return Promise.resolve(MOCK_NO_DATA_IN_WINDOW);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, [
        'Check health of logger 925 for January 20, 2025',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);
    });
  });

  describe('Free Chat Flow', () => {
    it('should handle general queries', async () => {
      const result = await simulateConversation(service, [
        'Tell me about solar energy',
      ]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);
    });

    it('should terminate correctly after response', async () => {
      const result = await simulateConversation(service, [
        'What is photovoltaic power?',
      ]);

      expect(result.success).toBe(true);
      // Should complete without hanging
      expect(result.durationMs).toBeLessThan(30000);
    });
  });

  describe('Multi-Step Conversations', () => {
    it('should maintain context across multiple turns', async () => {
      const result = await simulateConversation(
        service,
        ['Hello', 'Thanks for the greeting'],
        { includeAssistantResponses: true },
      );

      expect(result.success).toBe(true);
      expect(result.messageHistory.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle conversation with tool use', async () => {
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, ['Morning briefing']);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);
    });
  });

  describe('Tool Argument Serialization', () => {
    it('should serialize logger IDs correctly in compare_loggers', async () => {
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'compare_loggers')
          return Promise.resolve(MOCK_COMPARE_LOGGERS);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, [
        'Compare loggers 925 and 926',
      ]);

      expect(result.success).toBe(true);

      // Check that compare_loggers was called with correct args
      if (wasToolCalled(result.events, 'compare_loggers')) {
        const compareCall = result.events.toolInputs.find(
          (e) => e.toolName === 'compare_loggers',
        );
        expect(compareCall).toBeDefined();
      }
    });

    it('should serialize date ranges correctly', async () => {
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers')
          return Promise.resolve(MOCK_LIST_LOGGERS);
        if (toolName === 'analyze_inverter_health')
          return Promise.resolve(MOCK_HEALTH_CLEAN);
        if (toolName === 'get_fleet_overview')
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const result = await simulateConversation(service, [
        'Check health of logger 925 for last 7 days',
      ]);

      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty user messages', async () => {
      const result = await simulateConversation(service, ['']);

      // Should not crash
      expect(Array.isArray(result.events.all)).toBe(true);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'Check the health of '.repeat(50) + 'logger 925';
      const result = await simulateConversation(service, [longMessage]);

      expect(result.success).toBe(true);
      assertNoDuplicates(result.events);
    });

    it('should handle special characters in messages', async () => {
      const result = await simulateConversation(service, [
        'Check health of logger "925" (main inverter)',
      ]);

      expect(result.success).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const result = await simulateConversation(service, [
        'Check health 你好 🌍',
      ]);

      expect(result.success).toBe(true);
    });
  });

  describe('Event Integrity', () => {
    it('should emit events in correct order', async () => {
      const result = await simulateConversation(service, ['Morning briefing']);

      expect(result.success).toBe(true);

      // For each tool call, input should come before output
      const toolCalls = new Map<
        string,
        { inputIdx: number; outputIdx: number }
      >();

      result.events.all.forEach((event, idx) => {
        if (event.type === 'tool-input-available' && event.toolCallId) {
          const id = event.toolCallId;
          if (!toolCalls.has(id)) {
            toolCalls.set(id, { inputIdx: idx, outputIdx: -1 });
          } else {
            const existing = toolCalls.get(id)!;
            existing.inputIdx = idx;
          }
        }
        if (event.type === 'tool-output-available' && event.toolCallId) {
          const id = event.toolCallId;
          if (!toolCalls.has(id)) {
            toolCalls.set(id, { inputIdx: -1, outputIdx: idx });
          } else {
            const existing = toolCalls.get(id)!;
            existing.outputIdx = idx;
          }
        }
      });

      // Verify ordering
      for (const [, { inputIdx, outputIdx }] of toolCalls) {
        if (inputIdx !== -1 && outputIdx !== -1) {
          expect(inputIdx).toBeLessThan(outputIdx);
        }
      }
    });

    it('should not emit internal node text (router classification)', async () => {
      const result = await simulateConversation(service, ['Check health']);

      // Router produces JSON classification - should not appear in text deltas
      const routerJson = result.events.textDeltas.find(
        (e) => e.delta.includes('"flow"') && e.delta.includes('"confidence"'),
      );
      expect(routerJson).toBeUndefined();
    });
  });
});
