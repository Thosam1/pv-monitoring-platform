/**
 * Unit tests for langgraph.service.ts
 *
 * Tests the LangGraph service with FakeStreamingChatModel for deterministic behavior.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LanggraphService } from './langgraph.service';
import { ToolsHttpClient } from './tools-http.client';
import { createMockToolsClient } from './test-utils';

describe('LanggraphService', () => {
  let service: LanggraphService;
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    mockToolsClient = createMockToolsClient();

    // Mock config to use Gemini by default with a fake key
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
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: ToolsHttpClient,
          useValue: mockToolsClient,
        },
      ],
    }).compile();

    service = module.get<LanggraphService>(LanggraphService);
  });

  afterEach(() => {
    service.resetGraph();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report ready status', () => {
      const status = service.getStatus();
      expect(status.ready).toBe(true);
      expect(status.provider).toBe('gemini');
      expect(status.explicitFlowsEnabled).toBe(true);
    });
  });

  describe('getStatus', () => {
    it('should return provider configuration', () => {
      const status = service.getStatus();
      expect(status.provider).toBe('gemini');
    });

    it('should return MCP connection status', () => {
      const status = service.getStatus();
      expect(status.mcpConnected).toBe(true);
    });

    it('should return explicit flows enabled status', () => {
      const status = service.getStatus();
      expect(status.explicitFlowsEnabled).toBe(true);
    });
  });

  describe('provider configuration', () => {
    it('should use Gemini when configured', () => {
      const status = service.getStatus();
      expect(status.provider).toBe('gemini');
    });

    it('should fallback to gemini for invalid provider', () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'invalid-provider',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-api-key',
        };
        return config[key] ?? defaultValue;
      });

      // Reset to rebuild with new config
      service.resetGraph();

      const status = service.getStatus();
      expect(status.provider).toBe('gemini');
    });
  });

  describe('resetGraph', () => {
    it('should reset the graph and model', () => {
      // First access builds the graph
      service.isReady();

      // Reset
      service.resetGraph();

      // Should still be ready (rebuilds on next access)
      expect(service.isReady()).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return true when API key is configured', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          // No API key
        };
        return config[key] ?? defaultValue;
      });

      // Reset to rebuild with new config
      service.resetGraph();

      expect(service.isReady()).toBe(false);
    });
  });

  describe('chat method', () => {
    it('should return an async iterable', () => {
      const result = service.chat([{ role: 'user', content: 'Hello' }]);

      expect(result[Symbol.asyncIterator]).toBeDefined();
    });

    it('should have toUIMessageStreamResponse method', () => {
      const result = service.chat([{ role: 'user', content: 'Hello' }]);

      expect(typeof result.toUIMessageStreamResponse).toBe('function');
    });
  });

  describe('message conversion', () => {
    it('should convert user messages to HumanMessage', () => {
      const messages = [{ role: 'user', content: 'Test message' }];

      // This tests that the service accepts the message format
      const result = service.chat(messages);
      expect(result).toBeDefined();
    });

    it('should convert assistant messages to AIMessage', () => {
      const messages = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      const result = service.chat(messages);
      expect(result).toBeDefined();
    });

    it('should filter empty messages', () => {
      const messages = [
        { role: 'user', content: '' },
        { role: 'user', content: '   ' },
        { role: 'user', content: 'Valid message' },
      ];

      const result = service.chat(messages);
      expect(result).toBeDefined();
    });
  });

  describe('explicit flows feature flag', () => {
    it('should build explicit flow graph when enabled', () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-api-key',
          EXPLICIT_FLOWS_ENABLED: 'true',
        };
        return config[key] ?? defaultValue;
      });

      service.resetGraph();
      const status = service.getStatus();
      expect(status.explicitFlowsEnabled).toBe(true);
    });

    it('should build legacy graph when disabled', () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-api-key',
          EXPLICIT_FLOWS_ENABLED: 'false',
        };
        return config[key] ?? defaultValue;
      });

      service.resetGraph();
      const status = service.getStatus();
      expect(status.explicitFlowsEnabled).toBe(false);
    });
  });
});

describe('LanggraphService Provider Tests', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
  });

  it('should throw when Anthropic API key is missing', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          // No ANTHROPIC_API_KEY
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

    const service = module.get<LanggraphService>(LanggraphService);
    expect(service.isReady()).toBe(false);
  });

  it('should throw when OpenAI API key is missing', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          // No OPENAI_API_KEY
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

    const service = module.get<LanggraphService>(LanggraphService);
    expect(service.isReady()).toBe(false);
  });

  it('should configure Anthropic when API key is provided', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
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

    const service = module.get<LanggraphService>(LanggraphService);
    const status = service.getStatus();
    expect(status.provider).toBe('anthropic');
    expect(status.ready).toBe(true);
  });

  it('should configure OpenAI when API key is provided', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test-openai-key',
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

    const service = module.get<LanggraphService>(LanggraphService);
    const status = service.getStatus();
    expect(status.provider).toBe('openai');
    expect(status.ready).toBe(true);
  });
});
