/**
 * Unit tests for tools-http.client.ts
 *
 * Tests the HTTP client for calling Python solar-analyst tools.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ToolsHttpClient } from './tools-http.client';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ToolsHttpClient', () => {
  let client: ToolsHttpClient;
  let configService: Partial<ConfigService>;

  beforeEach(async () => {
    mockFetch.mockReset();

    configService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          MCP_SERVER_URL: 'http://localhost:4000',
        };
        return config[key] ?? defaultValue;
      }),
    };

    // Mock successful tool schema loading
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          tools: {
            list_loggers: {
              description: 'List available loggers',
              parameters: {},
            },
            analyze_inverter_health: {
              description: 'Analyze health',
              parameters: { logger_id: { type: 'string', required: true } },
            },
          },
        }),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsHttpClient,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    client = module.get<ToolsHttpClient>(ToolsHttpClient);

    // Trigger onModuleInit to load schemas
    await client.onModuleInit();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(client).toBeDefined();
    });

    it('should load tool schemas on init', () => {
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/tools');
    });

    it('should be connected after loading schemas', () => {
      expect(client.isConnected()).toBe(true);
    });

    it('should have tool schemas available', () => {
      const schemas = client.getToolSchemas();
      expect(schemas.list_loggers).toBeDefined();
      expect(schemas.analyze_inverter_health).toBeDefined();
    });
  });

  describe('URL configuration', () => {
    it('should strip /sse suffix for backwards compatibility', async () => {
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ tools: {} }),
      });

      const configWithSse = {
        get: jest.fn(() => 'http://localhost:4000/sse'),
      };

      const module = await Test.createTestingModule({
        providers: [
          ToolsHttpClient,
          { provide: ConfigService, useValue: configWithSse },
        ],
      }).compile();

      const clientWithSse = module.get<ToolsHttpClient>(ToolsHttpClient);
      await clientWithSse.onModuleInit();

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:4000/api/tools');
    });
  });

  describe('executeTool', () => {
    it('should call the correct endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: { loggers: [] },
          }),
      });

      await client.executeTool('list_loggers', {});

      expect(mockFetch).toHaveBeenLastCalledWith(
        'http://localhost:4000/api/tools/list_loggers',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should pass arguments in request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: { anomalies: [] },
          }),
      });

      await client.executeTool('analyze_inverter_health', {
        logger_id: '925',
        days: 7,
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ logger_id: '925', days: 7 }),
        }),
      );
    });

    it('should return the result on success', async () => {
      const mockResult = {
        loggers: [
          { loggerId: '925', loggerType: 'goodwe' },
          { loggerId: '926', loggerType: 'lti' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            result: mockResult,
          }),
      });

      const result = await client.executeTool('list_loggers', {});
      expect(result).toEqual(mockResult);
    });

    it('should throw on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Internal server error',
          }),
      });

      await expect(client.executeTool('list_loggers', {})).rejects.toThrow(
        'Internal server error',
      );
    });

    it('should throw on unsuccessful response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: false,
            error: 'Tool execution failed',
          }),
      });

      await expect(client.executeTool('list_loggers', {})).rejects.toThrow(
        'Tool execution failed',
      );
    });

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.executeTool('list_loggers', {})).rejects.toThrow(
        'Network error',
      );
    });
  });

  describe('isConnected', () => {
    it('should return true when schemas are loaded', () => {
      expect(client.isConnected()).toBe(true);
    });

    it('should return false when no schemas loaded', async () => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValue(new Error('Connection failed'));

      const module = await Test.createTestingModule({
        providers: [
          ToolsHttpClient,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const disconnectedClient = module.get<ToolsHttpClient>(ToolsHttpClient);
      await disconnectedClient.onModuleInit();

      expect(disconnectedClient.isConnected()).toBe(false);
    }, 60000); // Long timeout for retry delays
  });

  describe('refresh', () => {
    it('should reload tool schemas', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            tools: {
              new_tool: { description: 'A new tool', parameters: {} },
            },
          }),
      });

      await client.refresh();

      const schemas = client.getToolSchemas();
      expect(schemas.new_tool).toBeDefined();
    });
  });

  describe('retry logic', () => {
    it('should retry on initial connection failure', async () => {
      mockFetch.mockReset();

      // First 2 attempts fail, 3rd succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ tools: { test: {} } }),
        });

      const module = await Test.createTestingModule({
        providers: [
          ToolsHttpClient,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const retryClient = module.get<ToolsHttpClient>(ToolsHttpClient);
      await retryClient.onModuleInit();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(retryClient.isConnected()).toBe(true);
    }, 30000); // Timeout for retry delays (1s + 2s = 3s minimum)

    it('should give up after max retries', async () => {
      mockFetch.mockReset();

      // All 5 attempts fail
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const module = await Test.createTestingModule({
        providers: [
          ToolsHttpClient,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const failedClient = module.get<ToolsHttpClient>(ToolsHttpClient);
      await failedClient.onModuleInit();

      expect(mockFetch).toHaveBeenCalledTimes(5); // 5 max attempts
      expect(failedClient.isConnected()).toBe(false);
    }, 60000); // Long timeout for retry delays (1s + 2s + 4s + 8s = 15s minimum)
  });

  describe('getToolSchemas', () => {
    it('should return loaded schemas', () => {
      const schemas = client.getToolSchemas();

      expect(schemas).toHaveProperty('list_loggers');
      expect(schemas.list_loggers.description).toBe('List available loggers');
    });

    it('should return empty object when not connected', async () => {
      mockFetch.mockReset();
      mockFetch.mockRejectedValue(new Error('Failed'));

      const module = await Test.createTestingModule({
        providers: [
          ToolsHttpClient,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const disconnectedClient = module.get<ToolsHttpClient>(ToolsHttpClient);
      await disconnectedClient.onModuleInit();

      const schemas = disconnectedClient.getToolSchemas();
      expect(schemas).toEqual({});
    }, 60000); // Long timeout for retry delays
  });
});
