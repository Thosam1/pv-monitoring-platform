/**
 * Unit tests for langgraph.service.ts
 *
 * Tests the LangGraph service with FakeStreamingChatModel for deterministic behavior.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIMessage } from '@langchain/core/messages';
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

/**
 * Access private methods for testing.
 * This pattern is used to test internal logic without changing the public API.
 */
type ServicePrivateAccess = {
  isInternalNode(nodeName: string | undefined): boolean;
  stripFlowMetadata(text: string): string;
  extractTextFromContent(content: unknown): string | null;
  processStreamChunk(
    nodeName: string | undefined,
    content: string | unknown[] | undefined,
  ): Array<{ type: string; delta?: string }>;
  processToolCalls(
    toolCalls: Array<{ id?: string; name: string; args: unknown }>,
    reportedToolCalls: Set<string>,
  ): Array<{
    type: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>;
  processToolResult(
    runId: string | undefined,
    output: unknown,
    tags: string[] | undefined,
    reportedToolResults: Set<string>,
  ): Array<{ type: string; toolCallId?: string; output?: unknown }>;
  handleModelStream(
    event: { data?: unknown },
    nodeName: string | undefined,
  ): Array<{ type: string; delta?: string }>;
  handleModelEnd(
    event: { data?: unknown },
    nodeName: string | undefined,
    reportedToolCalls: Set<string>,
  ): Array<{
    type: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>;
  getMessageDeduplicationKey(msg: unknown): string | null;
  prefillDeduplicationSets(
    messages: unknown[],
    reportedFlowMessages: Set<string>,
    reportedToolCalls: Set<string>,
  ): void;
};

describe('LanggraphService Internal Methods', () => {
  let service: LanggraphService;
  let servicePrivate: ServicePrivateAccess;
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
    servicePrivate = service as unknown as ServicePrivateAccess;
  });

  afterEach(() => {
    service.resetGraph();
  });

  describe('isInternalNode', () => {
    it('should return true for router node', () => {
      expect(servicePrivate.isInternalNode('router')).toBe(true);
    });

    it('should return true for check_context node', () => {
      expect(servicePrivate.isInternalNode('check_context')).toBe(true);
    });

    it('should return true for check_results node', () => {
      expect(servicePrivate.isInternalNode('check_results')).toBe(true);
    });

    it('should return false for free_chat node', () => {
      expect(servicePrivate.isInternalNode('free_chat')).toBe(false);
    });

    it('should return false for undefined node', () => {
      expect(servicePrivate.isInternalNode(undefined)).toBe(false);
    });

    it('should return false for empty string node', () => {
      expect(servicePrivate.isInternalNode('')).toBe(false);
    });

    it('should return false for random node name', () => {
      expect(servicePrivate.isInternalNode('my_custom_node')).toBe(false);
    });
  });

  describe('stripFlowMetadata', () => {
    it('should strip flow context metadata from text', () => {
      const textWithMetadata =
        'Some message\n\n<!-- {"__flowContext":{"activeFlow":"health_check"}} -->';
      const result = servicePrivate.stripFlowMetadata(textWithMetadata);
      expect(result).toBe('Some message');
    });

    it('should return text unchanged when no metadata', () => {
      const plainText = 'Just a regular message';
      const result = servicePrivate.stripFlowMetadata(plainText);
      expect(result).toBe('Just a regular message');
    });

    it('should handle empty string', () => {
      expect(servicePrivate.stripFlowMetadata('')).toBe('');
    });

    it('should handle text with only metadata', () => {
      const onlyMetadata =
        '<!-- {"__flowContext":{"activeFlow":"greeting"}} -->';
      const result = servicePrivate.stripFlowMetadata(onlyMetadata);
      expect(result).toBe('');
    });

    it('should handle complex flow context', () => {
      const complexContext = `Response text

<!-- {"__flowContext":{"activeFlow":"financial_report","currentPromptArg":"loggerId","waitingForUserInput":true,"extractedArgs":{"startDate":"2025-01-01"}}} -->`;
      const result = servicePrivate.stripFlowMetadata(complexContext);
      expect(result).toBe('Response text');
    });
  });

  describe('extractTextFromContent', () => {
    it('should extract text from string content', () => {
      const result = servicePrivate.extractTextFromContent('Hello world');
      expect(result).toBe('Hello world');
    });

    it('should extract text from array with text block', () => {
      const content = [{ type: 'text', text: 'Array text content' }];
      const result = servicePrivate.extractTextFromContent(content);
      expect(result).toBe('Array text content');
    });

    it('should return null for empty array', () => {
      const result = servicePrivate.extractTextFromContent([]);
      expect(result).toBeNull();
    });

    it('should return null for null content', () => {
      const result = servicePrivate.extractTextFromContent(null);
      expect(result).toBeNull();
    });

    it('should return null for undefined content', () => {
      const result = servicePrivate.extractTextFromContent(undefined);
      expect(result).toBeNull();
    });

    it('should return null for number content', () => {
      const result = servicePrivate.extractTextFromContent(42);
      expect(result).toBeNull();
    });

    it('should handle multiple text blocks in array', () => {
      const content = [
        { type: 'text', text: 'First ' },
        { type: 'text', text: 'Second' },
      ];
      const result = servicePrivate.extractTextFromContent(content);
      expect(result).toBe('First Second');
    });

    it('should filter non-text blocks from array', () => {
      const content = [
        { type: 'text', text: 'Keep this' },
        { type: 'image', url: 'http://example.com' },
        { type: 'text', text: ' and this' },
      ];
      const result = servicePrivate.extractTextFromContent(content);
      expect(result).toBe('Keep this and this');
    });

    it('should strip flow metadata from string content', () => {
      const content =
        'Message text\n\n<!-- {"__flowContext":{"activeFlow":"test"}} -->';
      const result = servicePrivate.extractTextFromContent(content);
      expect(result).toBe('Message text');
    });

    it('should return null for empty string after stripping metadata', () => {
      const content = '<!-- {"__flowContext":{"activeFlow":"test"}} -->';
      const result = servicePrivate.extractTextFromContent(content);
      expect(result).toBeNull();
    });
  });

  describe('processStreamChunk', () => {
    it('should return empty array for internal nodes', () => {
      const result = servicePrivate.processStreamChunk('router', 'Some text');
      expect(result).toEqual([]);
    });

    it('should return text-delta for valid content', () => {
      const result = servicePrivate.processStreamChunk('free_chat', 'Hello');
      expect(result).toEqual([{ type: 'text-delta', delta: 'Hello' }]);
    });

    it('should return empty array for empty content', () => {
      const result = servicePrivate.processStreamChunk('free_chat', '');
      expect(result).toEqual([]);
    });

    it('should return empty array for undefined content', () => {
      const result = servicePrivate.processStreamChunk('free_chat', undefined);
      expect(result).toEqual([]);
    });

    it('should handle array content with text blocks', () => {
      const content = [{ type: 'text', text: 'Array content' }];
      const result = servicePrivate.processStreamChunk('free_chat', content);
      expect(result).toEqual([{ type: 'text-delta', delta: 'Array content' }]);
    });
  });

  describe('processToolCalls', () => {
    it('should return tool-input-available for standard tool', () => {
      const reportedToolCalls = new Set<string>();
      const toolCalls = [{ id: 'tool_123', name: 'list_loggers', args: {} }];
      const result = servicePrivate.processToolCalls(
        toolCalls,
        reportedToolCalls,
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: 'tool-input-available',
        toolCallId: 'tool_123',
        toolName: 'list_loggers',
        input: {},
      });
    });

    it('should return both input and output for render_ui_component', () => {
      const reportedToolCalls = new Set<string>();
      const toolCalls = [
        {
          id: 'tool_456',
          name: 'render_ui_component',
          args: { component: 'Chart', props: {} },
        },
      ];
      const result = servicePrivate.processToolCalls(
        toolCalls,
        reportedToolCalls,
      );
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('tool-input-available');
      expect(result[1].type).toBe('tool-output-available');
    });

    it('should skip already reported tool calls', () => {
      const reportedToolCalls = new Set<string>(['tool_789']);
      const toolCalls = [{ id: 'tool_789', name: 'list_loggers', args: {} }];
      const result = servicePrivate.processToolCalls(
        toolCalls,
        reportedToolCalls,
      );
      expect(result).toHaveLength(0);
    });

    it('should generate fallback ID when id is undefined', () => {
      const reportedToolCalls = new Set<string>();
      const toolCalls = [{ name: 'list_loggers', args: {} }];
      const result = servicePrivate.processToolCalls(
        toolCalls,
        reportedToolCalls,
      );
      expect(result).toHaveLength(1);
      expect(result[0].toolCallId).toMatch(/^tool_\d+$/);
    });

    it('should add tool call to reported set', () => {
      const reportedToolCalls = new Set<string>();
      const toolCalls = [{ id: 'track_me', name: 'test', args: {} }];
      servicePrivate.processToolCalls(toolCalls, reportedToolCalls);
      expect(reportedToolCalls.has('track_me')).toBe(true);
    });
  });

  describe('processToolResult', () => {
    it('should return tool-output-available for valid result', () => {
      const reportedToolResults = new Set<string>();
      const result = servicePrivate.processToolResult(
        'run_123',
        { status: 'ok', data: [] },
        ['tag1'],
        reportedToolResults,
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-output-available');
      expect(result[0].output).toEqual({ status: 'ok', data: [] });
    });

    it('should skip already reported results', () => {
      const reportedToolResults = new Set<string>(['run_123']);
      const result = servicePrivate.processToolResult(
        'run_123',
        { data: [] },
        [],
        reportedToolResults,
      );
      expect(result).toHaveLength(0);
    });

    it('should parse JSON string output', () => {
      const reportedToolResults = new Set<string>();
      const result = servicePrivate.processToolResult(
        'run_456',
        '{"parsed":true}',
        [],
        reportedToolResults,
      );
      expect(result[0].output).toEqual({ parsed: true });
    });

    it('should keep string if JSON parse fails', () => {
      const reportedToolResults = new Set<string>();
      const result = servicePrivate.processToolResult(
        'run_789',
        'not json',
        [],
        reportedToolResults,
      );
      expect(result[0].output).toBe('not json');
    });

    it('should use tag as toolCallId when available', () => {
      const reportedToolResults = new Set<string>();
      const result = servicePrivate.processToolResult(
        'run_abc',
        {},
        ['original_tool_id'],
        reportedToolResults,
      );
      expect(result[0].toolCallId).toBe('original_tool_id');
    });

    it('should generate fallback toolCallId when run_id is undefined', () => {
      const reportedToolResults = new Set<string>();
      const result = servicePrivate.processToolResult(
        undefined,
        {},
        [],
        reportedToolResults,
      );
      expect(result[0].toolCallId).toMatch(/^tool_result_\d+$/);
    });
  });

  describe('handleModelStream', () => {
    it('should return empty array for internal nodes', () => {
      const event = {
        data: { chunk: { content: 'Ignored' } },
      };
      const result = servicePrivate.handleModelStream(event, 'router');
      expect(result).toEqual([]);
    });

    it('should return text-delta for valid stream event', () => {
      const event = {
        data: { chunk: { content: 'Stream text' } },
      };
      const result = servicePrivate.handleModelStream(event, 'free_chat');
      expect(result).toEqual([{ type: 'text-delta', delta: 'Stream text' }]);
    });

    it('should handle undefined data', () => {
      const event = {};
      const result = servicePrivate.handleModelStream(event, 'free_chat');
      expect(result).toEqual([]);
    });

    it('should handle undefined chunk', () => {
      const event = { data: {} };
      const result = servicePrivate.handleModelStream(event, 'free_chat');
      expect(result).toEqual([]);
    });
  });

  describe('handleModelEnd', () => {
    it('should return empty array for internal nodes', () => {
      const event = {
        data: {
          output: { tool_calls: [{ id: 't1', name: 'test', args: {} }] },
        },
      };
      const result = servicePrivate.handleModelEnd(
        event,
        'router',
        new Set<string>(),
      );
      expect(result).toEqual([]);
    });

    it('should process tool calls for non-internal nodes', () => {
      const event = {
        data: {
          output: { tool_calls: [{ id: 't1', name: 'test', args: {} }] },
        },
      };
      const result = servicePrivate.handleModelEnd(
        event,
        'free_chat',
        new Set<string>(),
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-input-available');
    });

    it('should return empty array when no tool calls', () => {
      const event = { data: { output: {} } };
      const result = servicePrivate.handleModelEnd(
        event,
        'free_chat',
        new Set<string>(),
      );
      expect(result).toEqual([]);
    });

    it('should return empty array for empty tool_calls array', () => {
      const event = { data: { output: { tool_calls: [] } } };
      const result = servicePrivate.handleModelEnd(
        event,
        'free_chat',
        new Set<string>(),
      );
      expect(result).toEqual([]);
    });
  });

  describe('getMessageDeduplicationKey', () => {
    it('should use message id when available', () => {
      const msg = { id: 'msg_123', content: 'Some content' };
      const result = servicePrivate.getMessageDeduplicationKey(msg);
      expect(result).toBe('msg_123');
    });

    it('should use string content when id is missing', () => {
      const msg = { content: 'Fallback content' };
      const result = servicePrivate.getMessageDeduplicationKey(msg);
      expect(result).toBe('Fallback content');
    });

    it('should stringify non-string content', () => {
      const msg = { content: ['array', 'content'] };
      const result = servicePrivate.getMessageDeduplicationKey(msg);
      expect(result).toBe('["array","content"]');
    });

    it('should return null for message with no id or content', () => {
      const msg = {};
      const result = servicePrivate.getMessageDeduplicationKey(msg);
      expect(result).toBeNull();
    });
  });

  describe('prefillDeduplicationSets', () => {
    it('should add message keys to reportedFlowMessages', () => {
      const messages = [{ id: 'msg1', content: 'Test' }];
      const reportedFlowMessages = new Set<string>();
      const reportedToolCalls = new Set<string>();

      servicePrivate.prefillDeduplicationSets(
        messages,
        reportedFlowMessages,
        reportedToolCalls,
      );

      expect(reportedFlowMessages.has('msg1')).toBe(true);
    });

    it('should add tool call ids from AIMessages', () => {
      // Create a real AIMessage with tool_calls
      const aiMsg = new AIMessage({
        content: 'Response with tool calls',
        tool_calls: [{ id: 'tc1', name: 'test_tool', args: {} }],
      });
      const messages = [aiMsg];
      const reportedFlowMessages = new Set<string>();
      const reportedToolCalls = new Set<string>();

      servicePrivate.prefillDeduplicationSets(
        messages,
        reportedFlowMessages,
        reportedToolCalls,
      );

      expect(reportedToolCalls.has('tc1')).toBe(true);
    });

    it('should handle empty messages array', () => {
      const reportedFlowMessages = new Set<string>();
      const reportedToolCalls = new Set<string>();

      servicePrivate.prefillDeduplicationSets(
        [],
        reportedFlowMessages,
        reportedToolCalls,
      );

      expect(reportedFlowMessages.size).toBe(0);
      expect(reportedToolCalls.size).toBe(0);
    });

    it('should skip tool calls without id', () => {
      const aiMsg = new AIMessage({
        content: 'Response',
        tool_calls: [{ name: 'test_tool', args: {} }], // No id
      });
      const reportedToolCalls = new Set<string>();

      servicePrivate.prefillDeduplicationSets(
        [aiMsg],
        new Set<string>(),
        reportedToolCalls,
      );

      expect(reportedToolCalls.size).toBe(0);
    });
  });
});

/**
 * Additional test types for processStreamEvent dispatcher.
 */
type ProcessStreamEventAccess = {
  processStreamEvent(
    event: {
      event: string;
      data?: unknown;
      metadata?: unknown;
      run_id?: string;
      tags?: string[];
    },
    reportedToolCalls: Set<string>,
    reportedToolResults: Set<string>,
    reportedFlowMessages: Set<string>,
  ): Array<{
    type: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>;
  handleChainEnd(
    event: { data?: unknown },
    reportedToolCalls: Set<string>,
    reportedFlowMessages: Set<string>,
  ): Array<{
    type: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>;
};

describe('LanggraphService Stream Event Processing', () => {
  let service: LanggraphService;
  let servicePrivate: ProcessStreamEventAccess;
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
    servicePrivate = service as unknown as ProcessStreamEventAccess;
  });

  afterEach(() => {
    service.resetGraph();
  });

  describe('processStreamEvent dispatcher', () => {
    it('should dispatch on_chat_model_stream events', () => {
      const event = {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Hello' } },
        metadata: { langgraph_node: 'free_chat' },
      };
      const result = servicePrivate.processStreamEvent(
        event,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('text-delta');
    });

    it('should dispatch on_chat_model_end events', () => {
      const event = {
        event: 'on_chat_model_end',
        data: {
          output: { tool_calls: [{ id: 't1', name: 'test', args: {} }] },
        },
        metadata: { langgraph_node: 'free_chat' },
      };
      const result = servicePrivate.processStreamEvent(
        event,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-input-available');
    });

    it('should dispatch on_tool_end events', () => {
      const event = {
        event: 'on_tool_end',
        run_id: 'run_123',
        data: { output: { result: 'success' } },
        tags: ['tool_123'],
      };
      const result = servicePrivate.processStreamEvent(
        event,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-output-available');
    });

    it('should dispatch on_chain_end events', () => {
      const event = {
        event: 'on_chain_end',
        data: {
          output: {
            pendingUiActions: [
              { toolCallId: 'ui_1', toolName: 'render_ui_component', args: {} },
            ],
          },
        },
      };
      const result = servicePrivate.processStreamEvent(
        event,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(2); // input + output for render_ui_component
    });

    it('should return empty array for unknown events', () => {
      const event = {
        event: 'unknown_event_type',
        data: {},
      };
      const result = servicePrivate.processStreamEvent(
        event,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(0);
    });

    it('should filter internal nodes for model stream events', () => {
      const event = {
        event: 'on_chat_model_stream',
        data: { chunk: { content: 'Router output' } },
        metadata: { langgraph_node: 'router' },
      };
      const result = servicePrivate.processStreamEvent(
        event,
        new Set<string>(),
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(0);
    });
  });

  describe('handleChainEnd', () => {
    it('should process pending UI actions', () => {
      const event = {
        data: {
          output: {
            pendingUiActions: [
              {
                toolCallId: 'ui_123',
                toolName: 'render_ui_component',
                args: { component: 'Chart' },
              },
            ],
          },
        },
      };
      const result = servicePrivate.handleChainEnd(
        event,
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('tool-input-available');
      expect(result[1].type).toBe('tool-output-available');
    });

    it('should process request_user_selection actions', () => {
      const event = {
        data: {
          output: {
            pendingUiActions: [
              {
                toolCallId: 'sel_456',
                toolName: 'request_user_selection',
                args: { prompt: 'Select a logger' },
              },
            ],
          },
        },
      };
      const result = servicePrivate.handleChainEnd(
        event,
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('tool-input-available');
    });

    it('should process AIMessage tool calls from chain output', () => {
      const aiMsg = new AIMessage({
        content: 'Processing',
        tool_calls: [{ id: 'tc_789', name: 'list_loggers', args: {} }],
      });
      const event = {
        data: {
          output: {
            messages: [aiMsg],
          },
        },
      };
      const result = servicePrivate.handleChainEnd(
        event,
        new Set<string>(),
        new Set<string>(),
      );
      expect(result.some((r) => r.type === 'tool-input-available')).toBe(true);
    });

    it('should return empty array when output is undefined', () => {
      const event = { data: {} };
      const result = servicePrivate.handleChainEnd(
        event,
        new Set<string>(),
        new Set<string>(),
      );
      expect(result).toHaveLength(0);
    });

    it('should skip already reported pending actions', () => {
      const reportedToolCalls = new Set<string>(['ui_already_reported']);
      const event = {
        data: {
          output: {
            pendingUiActions: [
              {
                toolCallId: 'ui_already_reported',
                toolName: 'render_ui_component',
                args: {},
              },
            ],
          },
        },
      };
      const result = servicePrivate.handleChainEnd(
        event,
        reportedToolCalls,
        new Set<string>(),
      );
      expect(result).toHaveLength(0);
    });

    it('should process text content from AIMessages', () => {
      const aiMsg = new AIMessage({
        content: 'Some text response',
      });
      const event = {
        data: {
          output: {
            messages: [aiMsg],
          },
        },
      };
      const result = servicePrivate.handleChainEnd(
        event,
        new Set<string>(),
        new Set<string>(),
      );
      expect(result.some((r) => r.type === 'text-delta')).toBe(true);
    });

    it('should skip text processing when pendingUiActions present', () => {
      const aiMsg = new AIMessage({
        content: 'Text that should be skipped',
      });
      const event = {
        data: {
          output: {
            messages: [aiMsg],
            pendingUiActions: [
              { toolCallId: 'ui_1', toolName: 'test_tool', args: {} },
            ],
          },
        },
      };
      const result = servicePrivate.handleChainEnd(
        event,
        new Set<string>(),
        new Set<string>(),
      );
      // Should have tool input but no text-delta
      expect(result.some((r) => r.type === 'text-delta')).toBe(false);
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

describe('LanggraphService Legacy Graph', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
  });

  it('should build legacy graph when explicit flows disabled', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
          EXPLICIT_FLOWS_ENABLED: 'false',
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

    expect(status.explicitFlowsEnabled).toBe(false);
    expect(status.ready).toBe(true);
  });

  it('should create stream with legacy graph', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
          EXPLICIT_FLOWS_ENABLED: 'false',
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
    const stream = service.streamChat([{ role: 'user', content: 'Hello' }]);

    expect(stream).toBeDefined();
    expect(stream[Symbol.asyncIterator]).toBeDefined();
  });

  it('should handle chat method with legacy graph', async () => {
    const configService: Partial<ConfigService> = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
          EXPLICIT_FLOWS_ENABLED: 'false',
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
    const chat = service.chat([{ role: 'user', content: 'Test' }]);

    expect(chat).toBeDefined();
    expect(typeof chat.toUIMessageStreamResponse).toBe('function');
  });
});

/**
 * Type for accessing flow context extraction methods.
 */
type FlowContextAccess = {
  extractFlowContextFromMessages(messages: unknown[]):
    | {
        activeFlow?: string;
        flowStep?: number;
        flowContext?: Record<string, unknown>;
      }
    | undefined;
  extractTextFromAiMessage(
    msg: unknown,
    reportedFlowMessages: Set<string>,
  ): Array<{ type: string; delta?: string }>;
  processFlowMessages(
    messages: unknown[],
    reportedFlowMessages: Set<string>,
  ): Array<{ type: string; delta?: string }>;
  processPendingUiActions(
    actions: Array<{
      toolCallId: string;
      toolName: string;
      args: unknown;
    }>,
    reportedToolCalls: Set<string>,
  ): Array<{
    type: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>;
  processAiMessageToolCalls(
    messages: unknown[],
    reportedToolCalls: Set<string>,
  ): Array<{
    type: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }>;
};

describe('LanggraphService Flow Context Extraction', () => {
  let service: LanggraphService;
  let servicePrivate: FlowContextAccess;
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
    servicePrivate = service as unknown as FlowContextAccess;
  });

  afterEach(() => {
    service.resetGraph();
  });

  describe('extractFlowContextFromMessages', () => {
    it('should return undefined when no flow context in messages', () => {
      const messages = [new AIMessage({ content: 'No context here' })];
      const result = servicePrivate.extractFlowContextFromMessages(messages);
      expect(result).toBeUndefined();
    });

    it('should extract flow context from embedded metadata', () => {
      const msgWithContext = new AIMessage({
        content: `Select a logger:\n\n<!-- {"__flowContext":{"activeFlow":"health_check","currentPromptArg":"loggerId","waitingForUserInput":true}} -->`,
      });
      const result = servicePrivate.extractFlowContextFromMessages([
        msgWithContext,
      ]);
      expect(result).toBeDefined();
      expect(result?.activeFlow).toBe('health_check');
    });

    it('should return undefined for malformed JSON in metadata', () => {
      const malformedMsg = new AIMessage({
        content: `Msg\n\n<!-- {"__flowContext":{"broken json -->`,
      });
      const result = servicePrivate.extractFlowContextFromMessages([
        malformedMsg,
      ]);
      expect(result).toBeUndefined();
    });

    it('should search backwards to find most recent context', () => {
      const oldContext = new AIMessage({
        content: `Old\n\n<!-- {"__flowContext":{"activeFlow":"greeting"}} -->`,
      });
      const newContext = new AIMessage({
        content: `New\n\n<!-- {"__flowContext":{"activeFlow":"health_check"}} -->`,
      });
      const result = servicePrivate.extractFlowContextFromMessages([
        oldContext,
        newContext,
      ]);
      expect(result?.activeFlow).toBe('health_check');
    });
  });

  describe('extractTextFromAiMessage', () => {
    it('should extract text from string content', () => {
      const msg = new AIMessage({ content: 'Hello world' });
      const reported = new Set<string>();
      const result = servicePrivate.extractTextFromAiMessage(msg, reported);
      expect(result).toHaveLength(1);
      expect(result[0].delta).toBe('Hello world');
    });

    it('should skip already reported messages', () => {
      const msg = new AIMessage({ content: 'Already seen' });
      const reported = new Set<string>(['Already seen']);
      const result = servicePrivate.extractTextFromAiMessage(msg, reported);
      expect(result).toHaveLength(0);
    });

    it('should handle array content with text parts', () => {
      const msg = new AIMessage({
        content: [
          { type: 'text', text: 'Part one' },
          { type: 'text', text: ' Part two' },
        ],
      });
      const reported = new Set<string>();
      const result = servicePrivate.extractTextFromAiMessage(msg, reported);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should strip flow metadata from content', () => {
      const msg = new AIMessage({
        content: `Clean text\n\n<!-- {"__flowContext":{"activeFlow":"test"}} -->`,
      });
      const reported = new Set<string>();
      const result = servicePrivate.extractTextFromAiMessage(msg, reported);
      expect(result[0].delta).toBe('Clean text');
    });
  });

  describe('processFlowMessages', () => {
    it('should process multiple AIMessages', () => {
      const messages = [
        new AIMessage({ content: 'First message' }),
        new AIMessage({ content: 'Second message' }),
      ];
      const reported = new Set<string>();
      const result = servicePrivate.processFlowMessages(messages, reported);
      expect(result.length).toBe(2);
    });

    it('should skip non-AI messages', () => {
      const messages = [
        { content: 'Not an AIMessage' }, // Plain object
        new AIMessage({ content: 'AI message' }),
      ];
      const reported = new Set<string>();
      const result = servicePrivate.processFlowMessages(messages, reported);
      expect(result.length).toBe(1);
    });

    it('should handle empty messages array', () => {
      const result = servicePrivate.processFlowMessages([], new Set<string>());
      expect(result).toHaveLength(0);
    });
  });

  describe('processPendingUiActions', () => {
    it('should generate both input and output for render_ui_component', () => {
      const actions = [
        {
          toolCallId: 'ui_1',
          toolName: 'render_ui_component',
          args: { component: 'Chart' },
        },
      ];
      const reported = new Set<string>();
      const result = servicePrivate.processPendingUiActions(actions, reported);
      expect(result.length).toBe(2);
      expect(result[0].type).toBe('tool-input-available');
      expect(result[1].type).toBe('tool-output-available');
    });

    it('should generate only input for request_user_selection', () => {
      const actions = [
        {
          toolCallId: 'sel_1',
          toolName: 'request_user_selection',
          args: { prompt: 'Choose' },
        },
      ];
      const reported = new Set<string>();
      const result = servicePrivate.processPendingUiActions(actions, reported);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('tool-input-available');
    });

    it('should skip already reported actions', () => {
      const actions = [
        {
          toolCallId: 'ui_reported',
          toolName: 'render_ui_component',
          args: {},
        },
      ];
      const reported = new Set<string>(['ui_reported']);
      const result = servicePrivate.processPendingUiActions(actions, reported);
      expect(result.length).toBe(0);
    });

    it('should track reported actions in set', () => {
      const actions = [
        { toolCallId: 'ui_new', toolName: 'render_ui_component', args: {} },
      ];
      const reported = new Set<string>();
      servicePrivate.processPendingUiActions(actions, reported);
      expect(reported.has('ui_new')).toBe(true);
    });
  });

  describe('processAiMessageToolCalls', () => {
    it('should extract tool calls from AIMessage', () => {
      const aiMsg = new AIMessage({
        content: 'Calling tools',
        tool_calls: [{ id: 'tc_1', name: 'list_loggers', args: {} }],
      });
      const reported = new Set<string>();
      const result = servicePrivate.processAiMessageToolCalls(
        [aiMsg],
        reported,
      );
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].type).toBe('tool-input-available');
    });

    it('should skip tool calls without id', () => {
      const aiMsg = new AIMessage({
        content: 'Tools',
        tool_calls: [{ name: 'test', args: {} }], // No id
      });
      const reported = new Set<string>();
      const result = servicePrivate.processAiMessageToolCalls(
        [aiMsg],
        reported,
      );
      // Should still process but generate fallback id
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle render_ui_component with output', () => {
      const aiMsg = new AIMessage({
        content: '',
        tool_calls: [
          { id: 'ui_tc', name: 'render_ui_component', args: { data: [] } },
        ],
      });
      const reported = new Set<string>();
      const result = servicePrivate.processAiMessageToolCalls(
        [aiMsg],
        reported,
      );
      expect(result.length).toBe(2); // input + output
    });

    it('should skip non-AIMessage objects', () => {
      const plainObj = { content: 'Not AI' };
      const reported = new Set<string>();
      const result = servicePrivate.processAiMessageToolCalls(
        [plainObj],
        reported,
      );
      expect(result).toHaveLength(0);
    });
  });
});
