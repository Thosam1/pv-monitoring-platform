/**
 * Unit tests for ai.service.ts
 *
 * Tests the AI Service with mocked dependencies.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { ToolsHttpClient } from './tools-http.client';
import { createMockToolsClient } from './test-utils';

describe('AiService', () => {
  let service: AiService;
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    mockToolsClient = createMockToolsClient();

    // Default config: Gemini with test key
    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key',
        };
        return config[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
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

    service = module.get<AiService>(AiService);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report ready status when API key is configured', () => {
      expect(service.isReady()).toBe(true);
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

    it('should return ready status', () => {
      const status = service.getStatus();
      expect(status.ready).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return true when API key is configured', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should return false when Gemini API key is missing', async () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          // No GOOGLE_GENERATIVE_AI_API_KEY
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: configService },
          { provide: ToolsHttpClient, useValue: mockToolsClient },
        ],
      }).compile();

      const newService = module.get<AiService>(AiService);
      expect(newService.isReady()).toBe(false);
    });
  });

  describe('provider configuration', () => {
    it('should use Gemini when AI_PROVIDER=gemini', () => {
      const status = service.getStatus();
      expect(status.provider).toBe('gemini');
    });

    it('should use Anthropic when AI_PROVIDER=anthropic', async () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: configService },
          { provide: ToolsHttpClient, useValue: mockToolsClient },
        ],
      }).compile();

      const newService = module.get<AiService>(AiService);
      const status = newService.getStatus();
      expect(status.provider).toBe('anthropic');
      expect(status.ready).toBe(true);
    });

    it('should use OpenAI when AI_PROVIDER=openai', async () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test-openai-key',
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: configService },
          { provide: ToolsHttpClient, useValue: mockToolsClient },
        ],
      }).compile();

      const newService = module.get<AiService>(AiService);
      const status = newService.getStatus();
      expect(status.provider).toBe('openai');
      expect(status.ready).toBe(true);
    });

    it('should fallback to gemini for invalid provider', async () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'invalid-provider',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-google-key',
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: configService },
          { provide: ToolsHttpClient, useValue: mockToolsClient },
        ],
      }).compile();

      const newService = module.get<AiService>(AiService);
      const status = newService.getStatus();
      expect(status.provider).toBe('gemini');
    });

    it('should return not ready when Anthropic API key is missing', async () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          // No ANTHROPIC_API_KEY
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: configService },
          { provide: ToolsHttpClient, useValue: mockToolsClient },
        ],
      }).compile();

      const newService = module.get<AiService>(AiService);
      expect(newService.isReady()).toBe(false);
    });

    it('should return not ready when OpenAI API key is missing', async () => {
      configService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          // No OPENAI_API_KEY
        };
        return config[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: configService },
          { provide: ToolsHttpClient, useValue: mockToolsClient },
        ],
      }).compile();

      const newService = module.get<AiService>(AiService);
      expect(newService.isReady()).toBe(false);
    });
  });

  describe('chat method', () => {
    it('should accept message array and return a stream', () => {
      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = service.chat(messages);

      // Should return a streaming result object
      expect(result).toBeDefined();
    });

    it('should throw when no valid user message after sanitization', () => {
      const messages = [
        { role: 'user' as const, content: '' },
        { role: 'user' as const, content: '   ' },
      ];

      expect(() => service.chat(messages)).toThrow(
        'At least one user message with content is required',
      );
    });

    it('should filter empty messages before processing', () => {
      const messages = [
        { role: 'user' as const, content: '' },
        { role: 'user' as const, content: 'Valid message' },
      ];

      // Should not throw because there's one valid message
      const result = service.chat(messages);
      expect(result).toBeDefined();
    });

    it('should filter whitespace-only messages', () => {
      const messages = [
        { role: 'user' as const, content: '   ' },
        { role: 'user' as const, content: '\n\t' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = service.chat(messages);
      expect(result).toBeDefined();
    });

    it('should handle multi-turn conversations', () => {
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const result = service.chat(messages);
      expect(result).toBeDefined();
    });
  });

  describe('MCP client integration', () => {
    it('should report connected when MCP client is connected', () => {
      mockToolsClient.isConnected.mockReturnValue(true);

      const status = service.getStatus();
      expect(status.mcpConnected).toBe(true);
    });

    it('should report disconnected when MCP client is not connected', () => {
      mockToolsClient.isConnected.mockReturnValue(false);

      const status = service.getStatus();
      expect(status.mcpConnected).toBe(false);
    });
  });
});
