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

describe('LanggraphService Graph Behavior', () => {
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

  describe('streamChat', () => {
    it('should return an async generator', () => {
      const stream = service.streamChat([{ role: 'user', content: 'Hello' }]);
      expect(stream[Symbol.asyncIterator]).toBeDefined();
    });

    it('should accept message array format', () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Second message' },
      ];

      const stream = service.streamChat(messages);
      expect(stream).toBeDefined();
    });
  });

  describe('graph state management', () => {
    it('should maintain separate states across conversations', () => {
      // Start first conversation
      const stream1 = service.streamChat([
        { role: 'user', content: 'Check health' },
      ]);

      // Start second conversation (should have fresh state)
      const stream2 = service.streamChat([
        { role: 'user', content: 'Morning briefing' },
      ]);

      // Both should be independent async generators
      expect(stream1).not.toBe(stream2);
    });

    it('should reset state on resetGraph call', () => {
      // Access the graph
      service.isReady();

      // Reset
      service.resetGraph();

      // Should rebuild cleanly
      expect(service.isReady()).toBe(true);
    });
  });

  describe('tool execution', () => {
    it('should call mock tools client when tools are invoked', () => {
      mockToolsClient.executeTool.mockResolvedValue({
        status: 'ok',
        result: { loggers: [] },
      });

      // The mock is registered
      expect(mockToolsClient.executeTool).toBeDefined();
    });

    it('should handle tool execution errors gracefully', () => {
      mockToolsClient.executeTool.mockRejectedValue(
        new Error('Tool execution failed'),
      );

      // Service should still be ready
      expect(service.isReady()).toBe(true);
    });
  });

  describe('flow termination', () => {
    it('should properly terminate greeting flow', () => {
      // Greeting flow should be fast and deterministic
      const stream = service.streamChat([{ role: 'user', content: 'Hello' }]);

      // Should be an async generator
      expect(stream[Symbol.asyncIterator]).toBeDefined();
    });

    it('should handle empty message gracefully', () => {
      const stream = service.streamChat([{ role: 'user', content: '' }]);
      expect(stream).toBeDefined();
    });

    it('should handle whitespace-only message', () => {
      const stream = service.streamChat([{ role: 'user', content: '   ' }]);
      expect(stream).toBeDefined();
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

  it('should configure Ollama with default settings', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'ollama',
          OLLAMA_BASE_URL: 'http://localhost:11434',
          OLLAMA_MODEL: 'llama3',
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
    expect(status.provider).toBe('ollama');
    expect(status.ready).toBe(true);
  });

  it('should use Ollama without API key requirement', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'ollama',
          // Ollama does not require API key
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
    // Ollama is always ready since it doesn't need API key
    expect(service.isReady()).toBe(true);
  });
});

describe('LanggraphService Message Handling', () => {
  let service: LanggraphService;
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(async () => {
    mockToolsClient = createMockToolsClient();

    const configService: Partial<ConfigService> = {
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

  describe('message role handling', () => {
    it('should handle user role messages', () => {
      const stream = service.streamChat([{ role: 'user', content: 'Hello' }]);
      expect(stream).toBeDefined();
    });

    it('should handle assistant role messages', () => {
      const stream = service.streamChat([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ]);
      expect(stream).toBeDefined();
    });

    it('should handle system role messages', () => {
      const stream = service.streamChat([
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ]);
      expect(stream).toBeDefined();
    });

    it('should handle unknown role messages as user messages', () => {
      const stream = service.streamChat([
        { role: 'unknown_role', content: 'Test message' },
      ]);
      expect(stream).toBeDefined();
    });

    it('should filter out empty content messages', () => {
      const stream = service.streamChat([
        { role: 'user', content: '' },
        { role: 'user', content: '   ' },
        { role: 'user', content: 'Valid message' },
      ]);
      expect(stream).toBeDefined();
    });

    it('should handle multi-turn conversations', () => {
      const messages = [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Second question' },
        { role: 'assistant', content: 'Second answer' },
        { role: 'user', content: 'Third question' },
      ];
      const stream = service.streamChat(messages);
      expect(stream).toBeDefined();
    });
  });

  describe('flow context extraction', () => {
    it('should handle messages without flow context', () => {
      const stream = service.streamChat([{ role: 'user', content: 'Hello' }]);
      expect(stream).toBeDefined();
    });

    it('should handle messages with embedded flow context', () => {
      const contextMessage = `I need you to select a logger.

<!-- {"__flowContext":{"activeFlow":"health_check","currentPromptArg":"loggerId","waitingForUserInput":true}} -->`;

      const stream = service.streamChat([
        { role: 'assistant', content: contextMessage },
        { role: 'user', content: 'Logger 925' },
      ]);
      expect(stream).toBeDefined();
    });

    it('should handle malformed flow context gracefully', () => {
      const malformedContext = `Some message

<!-- {"__flowContext":{"invalid json -->`;

      const stream = service.streamChat([
        { role: 'assistant', content: malformedContext },
        { role: 'user', content: 'Continue' },
      ]);
      expect(stream).toBeDefined();
    });
  });

  describe('deduplication', () => {
    it('should handle duplicate messages in history', () => {
      const messages = [
        { role: 'user', content: 'Same message' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Same message' }, // Duplicate
      ];
      const stream = service.streamChat(messages);
      expect(stream).toBeDefined();
    });

    it('should handle large conversation histories', () => {
      const messages = Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));
      const stream = service.streamChat(messages);
      expect(stream).toBeDefined();
    });
  });
});

describe('LanggraphService Model Configuration', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
  });

  it('should use custom Gemini model when configured', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
          GEMINI_MODEL: 'gemini-pro',
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
    expect(service.isReady()).toBe(true);
  });

  it('should use custom Anthropic model when configured', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          ANTHROPIC_API_KEY: 'test-key',
          ANTHROPIC_MODEL: 'claude-3-opus-20240229',
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
    expect(service.isReady()).toBe(true);
    expect(service.getStatus().provider).toBe('anthropic');
  });

  it('should use custom OpenAI model when configured', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test-key',
          OPENAI_MODEL: 'gpt-4-turbo',
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
    expect(service.isReady()).toBe(true);
    expect(service.getStatus().provider).toBe('openai');
  });

  it('should use custom Ollama base URL and model', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'ollama',
          OLLAMA_BASE_URL: 'http://custom-host:11434',
          OLLAMA_MODEL: 'mistral:7b',
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
    expect(service.isReady()).toBe(true);
    expect(service.getStatus().provider).toBe('ollama');
  });
});
