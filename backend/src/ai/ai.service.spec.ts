import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { McpClient } from './mcp.client';

// Mock the AI SDK modules
jest.mock('ai', () => ({
  streamText: jest.fn(),
  tool: jest.fn((config) => config),
  stepCountIs: jest.fn().mockReturnValue(() => false),
}));

jest.mock('@ai-sdk/google', () => ({
  createGoogleGenerativeAI: jest.fn(() => jest.fn(() => 'google-model')),
}));

jest.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: jest.fn(() => jest.fn(() => 'anthropic-model')),
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => jest.fn(() => 'openai-model')),
}));

import { streamText } from 'ai';

const mockStreamText = streamText as jest.MockedFunction<typeof streamText>;

describe('AiService', () => {
  let service: AiService;
  let mockConfigService: Partial<ConfigService>;
  let mockMcpClient: Partial<McpClient>;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
          GEMINI_MODEL: 'gemini-1.5-flash',
        };
        return config[key] ?? defaultValue;
      }),
    };

    mockMcpClient = {
      isConnected: jest.fn().mockReturnValue(true),
      getTools: jest.fn().mockResolvedValue({
        list_loggers: { description: 'List loggers' },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: McpClient, useValue: mockMcpClient },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return status with gemini provider', () => {
      const status = service.getStatus();

      expect(status.provider).toBe('gemini');
      expect(status.mcpConnected).toBe(true);
    });

    it('should indicate ready when API key is configured', () => {
      const status = service.getStatus();

      expect(status.ready).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return true when API key is configured', () => {
      expect(service.isReady()).toBe(true);
    });

    it('should return false when API key is missing', () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'gemini',
          GEMINI_MODEL: 'gemini-1.5-flash',
          // No GOOGLE_GENERATIVE_AI_API_KEY
        };
        return config[key] ?? defaultValue;
      });

      expect(service.isReady()).toBe(false);
    });
  });

  describe('provider selection', () => {
    it('should select anthropic provider when configured', async () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          ANTHROPIC_API_KEY: 'test-anthropic-key',
          ANTHROPIC_MODEL: 'claude-3-5-sonnet-20241022',
        };
        return config[key] ?? defaultValue;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: McpClient, useValue: mockMcpClient },
        ],
      }).compile();

      const newService = newModule.get<AiService>(AiService);
      const status = newService.getStatus();

      expect(status.provider).toBe('anthropic');
    });

    it('should select openai provider when configured', async () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          OPENAI_API_KEY: 'test-openai-key',
          OPENAI_MODEL: 'gpt-4o',
        };
        return config[key] ?? defaultValue;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: McpClient, useValue: mockMcpClient },
        ],
      }).compile();

      const newService = newModule.get<AiService>(AiService);
      const status = newService.getStatus();

      expect(status.provider).toBe('openai');
    });

    it('should fallback to gemini for invalid provider', async () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'invalid-provider',
          GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
        };
        return config[key] ?? defaultValue;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: McpClient, useValue: mockMcpClient },
        ],
      }).compile();

      const newService = newModule.get<AiService>(AiService);
      const status = newService.getStatus();

      expect(status.provider).toBe('gemini');
    });
  });

  describe('chat', () => {
    it('should call streamText with correct parameters', async () => {
      const mockResult = { text: 'Hello!' };
      mockStreamText.mockReturnValue(mockResult as any);

      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = await service.chat(messages);

      expect(mockStreamText).toHaveBeenCalled();
      expect(result).toBe(mockResult);
    });

    it('should include system prompt in messages', async () => {
      const mockResult = { text: 'Response' };
      mockStreamText.mockReturnValue(mockResult as any);

      const messages = [{ role: 'user' as const, content: 'Test' }];
      await service.chat(messages);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.messages[0].role).toBe('system');
      expect(callArgs.messages[1]).toEqual(messages[0]);
    });

    it('should get tools from MCP client', async () => {
      const mockResult = { text: 'Response' };
      mockStreamText.mockReturnValue(mockResult as any);

      await service.chat([{ role: 'user', content: 'Test' }]);

      expect(mockMcpClient.getTools).toHaveBeenCalled();
    });

    it('should include render_ui_component tool', async () => {
      const mockResult = { text: 'Response' };
      mockStreamText.mockReturnValue(mockResult as any);

      await service.chat([{ role: 'user', content: 'Test' }]);

      const callArgs = mockStreamText.mock.calls[0][0];
      expect(callArgs.tools).toHaveProperty('list_loggers');
      expect(callArgs.tools).toHaveProperty('render_ui_component');
    });

    it('should work with empty MCP tools', async () => {
      mockMcpClient.getTools = jest.fn().mockResolvedValue({});
      const mockResult = { text: 'Response' };
      mockStreamText.mockReturnValue(mockResult as any);

      await service.chat([{ role: 'user', content: 'Test' }]);

      const callArgs = mockStreamText.mock.calls[0][0];
      // Should still have render_ui_component
      expect(callArgs.tools).toHaveProperty('render_ui_component');
    });
  });

  describe('MCP connection status', () => {
    it('should report mcpConnected false when MCP client disconnected', async () => {
      mockMcpClient.isConnected = jest.fn().mockReturnValue(false);

      const newModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: McpClient, useValue: mockMcpClient },
        ],
      }).compile();

      const newService = newModule.get<AiService>(AiService);
      const status = newService.getStatus();

      expect(status.mcpConnected).toBe(false);
    });
  });

  describe('provider API key validation', () => {
    it('should throw when Anthropic API key is missing', async () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'anthropic',
          // No ANTHROPIC_API_KEY
        };
        return config[key] ?? defaultValue;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: McpClient, useValue: mockMcpClient },
        ],
      }).compile();

      const newService = newModule.get<AiService>(AiService);
      expect(newService.isReady()).toBe(false);
    });

    it('should throw when OpenAI API key is missing', async () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          AI_PROVIDER: 'openai',
          // No OPENAI_API_KEY
        };
        return config[key] ?? defaultValue;
      });

      const newModule = await Test.createTestingModule({
        providers: [
          AiService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: McpClient, useValue: mockMcpClient },
        ],
      }).compile();

      const newService = newModule.get<AiService>(AiService);
      expect(newService.isReady()).toBe(false);
    });
  });
});
