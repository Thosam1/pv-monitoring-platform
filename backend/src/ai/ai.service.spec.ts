import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { McpClient } from './mcp.client';

describe('AiService', () => {
  let service: AiService;
  let mockConfigService: Partial<ConfigService>;
  let mockMcpClient: Partial<McpClient>;

  beforeEach(async () => {
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
      getTools: jest.fn().mockResolvedValue({}),
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
});
