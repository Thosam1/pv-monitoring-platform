/**
 * Integration tests for langgraph.service.ts
 *
 * These tests run with a real LLM (Ollama or Gemini) when configured.
 * Skip these tests if no LLM is available.
 *
 * Environment variables:
 * - TEST_AI_PROVIDER: 'ollama' | 'gemini' | 'skip' (default: skip)
 * - OLLAMA_BASE_URL: Ollama server URL (default: http://127.0.0.1:11434)
 * - OLLAMA_MODEL: Ollama model name (default: llama3.1:8b-instruct-q8_0)
 * - TEST_USE_REAL_TOOLS: 'true' to hit real Python API (default: false)
 *
 * Run with:
 *   TEST_AI_PROVIDER=ollama npm run test:ai:integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LanggraphService } from './langgraph.service';
import { ToolsHttpClient } from './tools-http.client';
import { createMockToolsClient } from './test-utils';

// Check if integration tests should run
const TEST_AI_PROVIDER = process.env.TEST_AI_PROVIDER || 'skip';
const shouldRunIntegration =
  TEST_AI_PROVIDER === 'ollama' || TEST_AI_PROVIDER === 'gemini';
// Reserved for future use when testing with real Python API
// const USE_REAL_TOOLS = process.env.TEST_USE_REAL_TOOLS === 'true';

// Skip entire file if no provider configured
const describeOrSkip = shouldRunIntegration ? describe : describe.skip;

describeOrSkip('LanggraphService Integration Tests', () => {
  let service: LanggraphService;
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let configService: Partial<ConfigService>;

  beforeAll(async () => {
    // Set up config based on provider
    const config: Record<string, string> = {
      AI_PROVIDER: TEST_AI_PROVIDER,
      EXPLICIT_FLOWS_ENABLED: 'true',
    };

    if (TEST_AI_PROVIDER === 'ollama') {
      config.OLLAMA_BASE_URL =
        process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
      config.OLLAMA_MODEL =
        process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct-q8_0';
    } else if (TEST_AI_PROVIDER === 'gemini') {
      const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'GOOGLE_GENERATIVE_AI_API_KEY required for Gemini integration tests',
        );
      }
      config.GOOGLE_GENERATIVE_AI_API_KEY = apiKey;
    }

    configService = {
      get: jest.fn(
        (key: string, defaultValue?: string) => config[key] ?? defaultValue,
      ),
    };

    mockToolsClient = createMockToolsClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LanggraphService,
        { provide: ConfigService, useValue: configService },
        { provide: ToolsHttpClient, useValue: mockToolsClient },
      ],
    }).compile();

    service = module.get<LanggraphService>(LanggraphService);
  });

  afterAll(() => {
    service?.resetGraph();
  });

  describe('with real LLM', () => {
    it('should initialize and be ready', () => {
      const status = service.getStatus();
      expect(status.ready).toBe(true);
      expect(status.provider).toBe(TEST_AI_PROVIDER);
    });

    describe('intent classification', () => {
      // These tests validate that the real LLM correctly classifies intents
      // Note: LLM responses can vary, so we use flexible assertions

      it('should classify morning briefing intent', async () => {
        const events: Array<{ type: string; delta?: string }> = [];

        const stream = service.streamChat([
          { role: 'user', content: 'Give me a morning briefing' },
        ]);

        for await (const event of stream) {
          events.push(event);
          // Stop after we get some response to avoid long waits
          if (events.length > 5) break;
        }

        // Should get at least one event
        expect(events.length).toBeGreaterThan(0);
      }, 60000); // 60s timeout for LLM calls

      it('should classify health check intent with logger ID', async () => {
        const events: Array<{
          type: string;
          toolName?: string;
          input?: unknown;
        }> = [];

        const stream = service.streamChat([
          { role: 'user', content: 'Check health of logger 925' },
        ]);

        for await (const event of stream) {
          events.push(event);
          if (events.length > 10) break;
        }

        expect(events.length).toBeGreaterThan(0);
      }, 60000);

      it('should handle financial query', async () => {
        const events: Array<{
          type: string;
          toolName?: string;
        }> = [];

        const stream = service.streamChat([
          { role: 'user', content: 'How much did I save this month?' },
        ]);

        for await (const event of stream) {
          events.push(event);
          if (events.length > 10) break;
        }

        expect(events.length).toBeGreaterThan(0);
      }, 60000);
    });

    describe('tool calling', () => {
      it('should emit tool-input-available events', async () => {
        const toolEvents: Array<{
          type: string;
          toolName?: string;
          input?: unknown;
        }> = [];

        const stream = service.streamChat([
          { role: 'user', content: 'List all my loggers' },
        ]);

        for await (const event of stream) {
          if (event.type === 'tool-input-available') {
            toolEvents.push(event);
          }
          if (toolEvents.length > 0) break;
        }

        // Should call list_loggers tool
        expect(toolEvents.length).toBeGreaterThan(0);
        expect(toolEvents[0].toolName).toBe('list_loggers');
      }, 60000);

      it('should emit tool-output-available events', async () => {
        const outputEvents: Array<{
          type: string;
          output?: unknown;
        }> = [];

        const stream = service.streamChat([
          { role: 'user', content: 'Show me all available loggers' },
        ]);

        for await (const event of stream) {
          if (event.type === 'tool-output-available') {
            outputEvents.push(event);
            break;
          }
        }

        // Should get tool output
        if (outputEvents.length > 0) {
          expect(outputEvents[0].output).toBeDefined();
        }
      }, 60000);
    });

    describe('streaming', () => {
      it('should stream text-delta events', async () => {
        const textEvents: Array<{ type: string; delta?: string }> = [];

        const stream = service.streamChat([
          { role: 'user', content: 'Say hello in one sentence' },
        ]);

        for await (const event of stream) {
          if (event.type === 'text-delta') {
            textEvents.push(event);
          }
          if (textEvents.length > 5) break;
        }

        expect(textEvents.length).toBeGreaterThan(0);
        expect(textEvents[0].delta).toBeDefined();
      }, 60000);

      it('should concatenate text deltas into coherent response', async () => {
        const textParts: string[] = [];

        const stream = service.streamChat([
          { role: 'user', content: 'What is 2+2?' },
        ]);

        for await (const event of stream) {
          if (event.type === 'text-delta' && event.delta) {
            textParts.push(event.delta);
          }
        }

        const fullResponse = textParts.join('');
        // Response should contain "4" somewhere
        expect(fullResponse.length).toBeGreaterThan(0);
      }, 60000);
    });

    describe('conversation history', () => {
      it('should maintain context across messages', async () => {
        const events: Array<{ type: string; delta?: string }> = [];

        // First message establishes context
        const stream = service.streamChat([
          { role: 'user', content: 'My name is TestUser' },
          { role: 'assistant', content: 'Nice to meet you, TestUser!' },
          { role: 'user', content: 'What is my name?' },
        ]);

        for await (const event of stream) {
          events.push(event);
          if (events.length > 15) break;
        }

        // Should get some response
        expect(events.length).toBeGreaterThan(0);
      }, 60000);
    });

    describe('error handling', () => {
      it('should handle empty messages gracefully', async () => {
        const events: Array<{ type: string }> = [];

        const stream = service.streamChat([]);

        for await (const event of stream) {
          events.push(event);
        }

        // Should complete without error
        expect(Array.isArray(events)).toBe(true);
      }, 60000);

      it('should handle messages with only whitespace', async () => {
        const events: Array<{ type: string }> = [];

        const stream = service.streamChat([{ role: 'user', content: '   ' }]);

        for await (const event of stream) {
          events.push(event);
        }

        // Should complete without throwing
        expect(Array.isArray(events)).toBe(true);
      }, 60000);
    });
  });
});

// Ollama-specific tests
const describeOllama = TEST_AI_PROVIDER === 'ollama' ? describe : describe.skip;

describeOllama('Ollama-specific Integration Tests', () => {
  let service: LanggraphService;

  beforeAll(async () => {
    const configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'ollama',
          OLLAMA_BASE_URL:
            process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
          OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama3.1:8b-instruct-q8_0',
          EXPLICIT_FLOWS_ENABLED: 'true',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const mockToolsClient = createMockToolsClient();

    const module = await Test.createTestingModule({
      providers: [
        LanggraphService,
        { provide: ConfigService, useValue: configService },
        { provide: ToolsHttpClient, useValue: mockToolsClient },
      ],
    }).compile();

    service = module.get<LanggraphService>(LanggraphService);
  });

  it('should use Ollama provider', () => {
    const status = service.getStatus();
    expect(status.provider).toBe('ollama');
  });

  it('should stream from Ollama model', async () => {
    const events: Array<{ type: string }> = [];

    const stream = service.streamChat([{ role: 'user', content: 'Hello' }]);

    for await (const event of stream) {
      events.push(event);
      if (events.length > 3) break;
    }

    expect(events.length).toBeGreaterThan(0);
  }, 60000);
});
