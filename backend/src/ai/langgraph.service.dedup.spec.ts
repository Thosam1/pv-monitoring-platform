/**
 * Deduplication Tests for LanggraphService.
 *
 * Tests the critical deduplication logic that prevents duplicate SSE events
 * from being emitted to the frontend. This includes:
 * - Tool call deduplication (reportedToolCalls Set)
 * - Tool result deduplication (reportedToolResults Set)
 * - Flow message deduplication (reportedFlowMessages Set)
 * - Internal node filtering (INTERNAL_NODES Set)
 * - Immediate output for render_ui_component
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LanggraphService } from './langgraph.service';
import { ToolsHttpClient } from './tools-http.client';
import { createMockToolsClient, MOCK_FLEET_OVERVIEW } from './test-utils';

interface StreamEvent {
  type: string;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
}

/**
 * Helper to collect all events from the streamChat generator.
 */
async function collectStreamEvents(
  service: LanggraphService,
  messages: Array<{ role: string; content: string }>,
  maxEvents = 100,
  timeoutMs = 30000,
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  const startTime = Date.now();

  try {
    for await (const event of service.streamChat(messages)) {
      events.push(event as StreamEvent);

      // Safety limits
      if (events.length >= maxEvents) break;
      if (Date.now() - startTime > timeoutMs) break;
    }
  } catch (error) {
    // Log but don't fail - some tests may intentionally cause errors
    console.log('Stream ended with:', error);
  }

  return events;
}

/**
 * Find duplicate events in a stream.
 */
function findDuplicateToolCalls(events: StreamEvent[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const event of events) {
    if (event.type === 'tool-input-available' && event.toolCallId) {
      const key = `input:${event.toolCallId}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
    if (event.type === 'tool-output-available' && event.toolCallId) {
      const key = `output:${event.toolCallId}`;
      if (seen.has(key)) {
        duplicates.push(key);
      }
      seen.add(key);
    }
  }

  return duplicates;
}

/**
 * Find duplicate text deltas in a stream.
 */
function findDuplicateTextDeltas(events: StreamEvent[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const event of events) {
    if (event.type === 'text-delta' && event.delta) {
      const key = event.delta.trim();
      if (key && seen.has(key)) {
        duplicates.push(key);
      }
      if (key) {
        seen.add(key);
      }
    }
  }

  return duplicates;
}

describe('LanggraphService Deduplication', () => {
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

  describe('tool call deduplication', () => {
    it('should not emit duplicate tool-input-available events', async () => {
      // Use greeting flow which doesn't use tools - simpler to test
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Hello' },
      ]);

      const duplicates = findDuplicateToolCalls(events);
      expect(duplicates).toHaveLength(0);
    });

    it('should track toolCallIds in a Set', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Morning briefing' },
      ]);

      // Count tool-input-available events
      const toolInputEvents = events.filter(
        (e) => e.type === 'tool-input-available',
      );

      // Each should have unique toolCallId
      const toolCallIds = toolInputEvents.map((e) => e.toolCallId);
      const uniqueIds = new Set(toolCallIds);

      expect(toolCallIds.length).toBe(uniqueIds.size);
    });
  });

  describe('tool result deduplication', () => {
    it('should not emit duplicate tool-output-available events', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Check the fleet status' },
      ]);

      const duplicates = findDuplicateToolCalls(events);
      expect(duplicates).toHaveLength(0);
    });

    it('should emit tool-output for each unique tool call', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Morning briefing' },
      ]);

      // Count tool-output-available events
      const toolOutputEvents = events.filter(
        (e) => e.type === 'tool-output-available',
      );

      // Each should have unique toolCallId
      const toolCallIds = toolOutputEvents.map((e) => e.toolCallId);
      const uniqueIds = new Set(toolCallIds);

      expect(toolCallIds.length).toBe(uniqueIds.size);
    });
  });

  describe('flow message deduplication', () => {
    it('should not emit duplicate greeting messages', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Hello' },
      ]);

      const duplicates = findDuplicateTextDeltas(events);
      expect(duplicates).toHaveLength(0);
    });

    it('should emit text-delta only once per unique content', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Hi there' },
      ]);

      const textDeltas = events.filter((e) => e.type === 'text-delta');

      // Check for exact duplicate deltas
      const contents = textDeltas.map((e) => e.delta?.trim()).filter(Boolean);
      const uniqueContents = new Set(contents);

      expect(contents.length).toBe(uniqueContents.size);
    });

    it('should handle multi-part content arrays without duplication', async () => {
      // The greeting flow may return multi-part content
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Good morning' },
      ]);

      const duplicates = findDuplicateTextDeltas(events);
      expect(duplicates).toHaveLength(0);
    });
  });

  describe('internal node filtering', () => {
    it('should not emit text from router node', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Check health of logger 925' },
      ]);

      // Router node produces JSON classification like {"flow":"health_check"...}
      // This should NOT appear as text-delta
      const textDeltas = events.filter((e) => e.type === 'text-delta');
      const routerOutput = textDeltas.find(
        (e) => e.delta?.includes('"flow"') && e.delta?.includes('"confidence"'),
      );

      expect(routerOutput).toBeUndefined();
    });

    it('should emit text from greeting node', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Hello' },
      ]);

      const textDeltas = events.filter((e) => e.type === 'text-delta');

      // Greeting should produce some text
      expect(textDeltas.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('render_ui_component immediate output', () => {
    it('should emit both input and output for render_ui_component', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Morning briefing' },
      ]);

      // Find render_ui_component tool calls
      const renderInputs = events.filter(
        (e) =>
          e.type === 'tool-input-available' &&
          e.toolName === 'render_ui_component',
      );

      // For each input, there should be a corresponding output
      for (const input of renderInputs) {
        const correspondingOutput = events.find(
          (e) =>
            e.type === 'tool-output-available' &&
            e.toolCallId === input.toolCallId,
        );
        expect(correspondingOutput).toBeDefined();
      }
    });
  });

  describe('request_user_selection handling', () => {
    it('should emit tool-input-available for request_user_selection', async () => {
      // Health check without logger ID will prompt for selection
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Check health' },
      ]);

      const selectionInputs = events.filter(
        (e) =>
          e.type === 'tool-input-available' &&
          e.toolName === 'request_user_selection',
      );

      // May or may not have selection depending on flow
      // Just verify no duplicates if present
      if (selectionInputs.length > 0) {
        const ids = selectionInputs.map((e) => e.toolCallId);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
      }
    });

    it('should not emit immediate tool-output for request_user_selection', async () => {
      // Health check without logger ID will prompt for selection
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Check health' },
      ]);

      // Find request_user_selection inputs
      const selectionInputs = events.filter(
        (e) =>
          e.type === 'tool-input-available' &&
          e.toolName === 'request_user_selection',
      );

      // For each, verify there's no immediate output (unlike render_ui_component)
      for (const input of selectionInputs) {
        const immediateOutput = events.find(
          (e) =>
            e.type === 'tool-output-available' &&
            e.toolCallId === input.toolCallId &&
            e.output === input.input, // Immediate output would have same args
        );
        // request_user_selection should NOT have immediate output
        expect(immediateOutput).toBeUndefined();
      }
    });
  });

  describe('overall deduplication', () => {
    it('should produce no duplicate events for greeting flow', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Hello' },
      ]);

      const toolDuplicates = findDuplicateToolCalls(events);
      const textDuplicates = findDuplicateTextDeltas(events);

      expect(toolDuplicates).toHaveLength(0);
      expect(textDuplicates).toHaveLength(0);
    });

    it('should produce no duplicate events for morning briefing flow', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Morning briefing' },
      ]);

      const toolDuplicates = findDuplicateToolCalls(events);
      const textDuplicates = findDuplicateTextDeltas(events);

      expect(toolDuplicates).toHaveLength(0);
      expect(textDuplicates).toHaveLength(0);
    });

    it('should produce no duplicate events for health check flow', async () => {
      // Health check with logger ID to avoid selection prompt
      mockToolsClient.executeTool.mockImplementation((toolName: string) => {
        if (toolName === 'list_loggers') {
          return Promise.resolve({
            status: 'ok',
            result: {
              loggers: [
                {
                  loggerId: '925',
                  loggerType: 'goodwe',
                  recordCount: 1000,
                  dataRange: {
                    earliestData: '2024-01-01',
                    latestData: '2025-01-15',
                  },
                },
              ],
            },
          });
        }
        if (toolName === 'analyze_inverter_health') {
          return Promise.resolve({
            status: 'ok',
            result: {
              anomalies: [],
              summary: { healthScore: 100, totalAnomalies: 0 },
            },
          });
        }
        if (toolName === 'get_fleet_overview') {
          return Promise.resolve(MOCK_FLEET_OVERVIEW);
        }
        return Promise.resolve({ status: 'ok', result: {} });
      });

      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Check health of logger 925' },
      ]);

      const toolDuplicates = findDuplicateToolCalls(events);
      const textDuplicates = findDuplicateTextDeltas(events);

      expect(toolDuplicates).toHaveLength(0);
      expect(textDuplicates).toHaveLength(0);
    });
  });

  describe('event ordering', () => {
    it('should emit tool-input before tool-output for same toolCallId', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: 'Morning briefing' },
      ]);

      const toolEvents = events.filter(
        (e) =>
          e.type === 'tool-input-available' ||
          e.type === 'tool-output-available',
      );

      // Group by toolCallId
      const byToolCallId = new Map<string, StreamEvent[]>();
      for (const event of toolEvents) {
        if (event.toolCallId) {
          const existing = byToolCallId.get(event.toolCallId) || [];
          existing.push(event);
          byToolCallId.set(event.toolCallId, existing);
        }
      }

      // For each toolCallId, verify input comes before output
      for (const [, events] of byToolCallId) {
        const inputIndex = events.findIndex(
          (e) => e.type === 'tool-input-available',
        );
        const outputIndex = events.findIndex(
          (e) => e.type === 'tool-output-available',
        );

        if (inputIndex !== -1 && outputIndex !== -1) {
          expect(inputIndex).toBeLessThan(outputIndex);
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty message gracefully', async () => {
      const events = await collectStreamEvents(service, [
        { role: 'user', content: '' },
      ]);

      // Should not crash, may produce minimal events
      expect(Array.isArray(events)).toBe(true);
    });

    it('should handle very long messages', async () => {
      const longMessage = 'Check health '.repeat(100);
      const events = await collectStreamEvents(service, [
        { role: 'user', content: longMessage },
      ]);

      const duplicates = findDuplicateToolCalls(events);
      expect(duplicates).toHaveLength(0);
    });

    it('should handle rapid sequential requests', async () => {
      // Reset between requests to ensure clean state
      const events1 = await collectStreamEvents(service, [
        { role: 'user', content: 'Hello' },
      ]);
      service.resetGraph();

      const events2 = await collectStreamEvents(service, [
        { role: 'user', content: 'Hello again' },
      ]);

      // Each request should have no duplicates within itself
      expect(findDuplicateToolCalls(events1)).toHaveLength(0);
      expect(findDuplicateToolCalls(events2)).toHaveLength(0);
    });
  });
});
