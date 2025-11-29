import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { McpClient } from './mcp.client';

// Mock the @ai-sdk/mcp module
jest.mock('@ai-sdk/mcp', () => ({
  experimental_createMCPClient: jest.fn(),
}));

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

const mockCreateMCPClient = createMCPClient as jest.MockedFunction<
  typeof createMCPClient
>;

describe('McpClient', () => {
  let mcpClient: McpClient;
  let mockConfigService: Partial<ConfigService>;
  let mockMcpClientInstance: {
    tools: jest.Mock;
    close: jest.Mock;
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MCP_SERVER_URL') {
          return defaultValue ?? 'http://localhost:4000/sse';
        }
        return defaultValue;
      }),
    };

    mockMcpClientInstance = {
      tools: jest.fn().mockResolvedValue({
        list_loggers: { description: 'List all loggers' },
        get_power_curve: { description: 'Get power curve data' },
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Default: connection succeeds
    mockCreateMCPClient.mockResolvedValue(
      mockMcpClientInstance as unknown as ReturnType<typeof createMCPClient>,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpClient,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    // Get the client without calling onModuleInit
    mcpClient = module.get<McpClient>(McpClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(mcpClient).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should connect on module initialization', async () => {
      await mcpClient.onModuleInit();

      expect(mockCreateMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'sse',
          url: 'http://localhost:4000/sse',
        },
      });
      expect(mcpClient.isConnected()).toBe(true);
    });
  });

  describe('onModuleDestroy', () => {
    it('should close connection on module destroy', async () => {
      // First connect
      await mcpClient.onModuleInit();
      expect(mcpClient.isConnected()).toBe(true);

      // Then destroy
      await mcpClient.onModuleDestroy();

      expect(mockMcpClientInstance.close).toHaveBeenCalled();
      expect(mcpClient.isConnected()).toBe(false);
    });

    it('should handle destroy when not connected', async () => {
      // Don't connect first
      expect(mcpClient.isConnected()).toBe(false);

      // Should not throw
      await mcpClient.onModuleDestroy();
      expect(mockMcpClientInstance.close).not.toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    it('should connect successfully on first attempt', async () => {
      await mcpClient.connect();

      expect(mockCreateMCPClient).toHaveBeenCalledTimes(1);
      expect(mcpClient.isConnected()).toBe(true);
    });

    it('should use custom server URL from config', async () => {
      mockConfigService.get = jest.fn((key: string, defaultValue?: string) => {
        if (key === 'MCP_SERVER_URL') {
          return 'http://custom-server:5000/sse';
        }
        return defaultValue;
      });

      await mcpClient.connect();

      expect(mockCreateMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'sse',
          url: 'http://custom-server:5000/sse',
        },
      });
    });

    it('should retry on connection failure with exponential backoff', async () => {
      mockCreateMCPClient
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce(
          mockMcpClientInstance as unknown as ReturnType<
            typeof createMCPClient
          >,
        );

      const connectPromise = mcpClient.connect();

      // First retry delay: 1000ms
      await jest.advanceTimersByTimeAsync(1000);

      // Second retry delay: 2000ms
      await jest.advanceTimersByTimeAsync(2000);

      await connectPromise;

      expect(mockCreateMCPClient).toHaveBeenCalledTimes(3);
      expect(mcpClient.isConnected()).toBe(true);
    });

    it('should give up after max retries', async () => {
      mockCreateMCPClient.mockRejectedValue(new Error('Connection refused'));

      const connectPromise = mcpClient.connect();

      // Advance through all retry delays
      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, i));
      }

      await connectPromise;

      // Should have tried 5 times (maxRetries)
      expect(mockCreateMCPClient).toHaveBeenCalledTimes(5);
      expect(mcpClient.isConnected()).toBe(false);
    });

    it('should handle non-Error rejections', async () => {
      mockCreateMCPClient.mockRejectedValue('String error');

      const connectPromise = mcpClient.connect();

      // Advance through all retry delays
      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, i));
      }

      await connectPromise;

      expect(mcpClient.isConnected()).toBe(false);
    });
  });

  describe('close', () => {
    it('should close the client connection', async () => {
      await mcpClient.connect();
      expect(mcpClient.isConnected()).toBe(true);

      await mcpClient.close();

      expect(mockMcpClientInstance.close).toHaveBeenCalled();
      expect(mcpClient.isConnected()).toBe(false);
    });

    it('should handle close errors gracefully', async () => {
      mockMcpClientInstance.close.mockRejectedValue(new Error('Close failed'));

      await mcpClient.connect();
      await mcpClient.close();

      // Should not throw, client should be nullified
      expect(mcpClient.isConnected()).toBe(false);
    });

    it('should do nothing when not connected', async () => {
      await mcpClient.close();

      expect(mockMcpClientInstance.close).not.toHaveBeenCalled();
      expect(mcpClient.isConnected()).toBe(false);
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(mcpClient.isConnected()).toBe(false);
    });

    it('should return true after successful connection', async () => {
      await mcpClient.connect();
      expect(mcpClient.isConnected()).toBe(true);
    });

    it('should return false after closing', async () => {
      await mcpClient.connect();
      await mcpClient.close();
      expect(mcpClient.isConnected()).toBe(false);
    });
  });

  describe('getTools', () => {
    it('should return tools when connected', async () => {
      await mcpClient.connect();

      const tools = await mcpClient.getTools();

      expect(tools).toEqual({
        list_loggers: { description: 'List all loggers' },
        get_power_curve: { description: 'Get power curve data' },
      });
      expect(mockMcpClientInstance.tools).toHaveBeenCalled();
    });

    it('should return empty object when not connected', async () => {
      const tools = await mcpClient.getTools();

      expect(tools).toEqual({});
      expect(mockMcpClientInstance.tools).not.toHaveBeenCalled();
    });

    it('should attempt reconnect on tools() error and return empty', async () => {
      await mcpClient.connect();

      // First tools() call fails
      mockMcpClientInstance.tools
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce({});

      const tools = await mcpClient.getTools();

      expect(tools).toEqual({});
      // Should have tried to reconnect (close + connect)
      expect(mockMcpClientInstance.close).toHaveBeenCalled();
    });

    it('should reconnect and have working connection after error', async () => {
      await mcpClient.connect();

      // First tools() call fails
      mockMcpClientInstance.tools
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce({
          list_loggers: { description: 'List all loggers' },
        });

      // This call triggers reconnect
      await mcpClient.getTools();

      // After reconnect, connection should still be valid
      expect(mcpClient.isConnected()).toBe(true);
    });
  });

  describe('getServerUrl', () => {
    it('should use default URL when not configured', async () => {
      mockConfigService.get = jest.fn(
        (_key: string, defaultValue?: string) => defaultValue,
      );

      await mcpClient.connect();

      expect(mockCreateMCPClient).toHaveBeenCalledWith({
        transport: {
          type: 'sse',
          url: 'http://localhost:4000/sse',
        },
      });
    });
  });

  describe('reconnect', () => {
    it('should close existing connection and create new one', async () => {
      await mcpClient.connect();
      mockCreateMCPClient.mockClear();

      // Trigger reconnect through getTools() error
      mockMcpClientInstance.tools.mockRejectedValueOnce(
        new Error('Connection lost'),
      );

      await mcpClient.getTools();

      expect(mockMcpClientInstance.close).toHaveBeenCalled();
      expect(mockCreateMCPClient).toHaveBeenCalled();
    });
  });

  describe('integration scenarios', () => {
    it('should handle full lifecycle: init -> use -> destroy', async () => {
      // Init
      await mcpClient.onModuleInit();
      expect(mcpClient.isConnected()).toBe(true);

      // Use
      const tools = await mcpClient.getTools();
      expect(Object.keys(tools).length).toBe(2);

      // Destroy
      await mcpClient.onModuleDestroy();
      expect(mcpClient.isConnected()).toBe(false);
    });

    it('should handle server unavailable at startup', async () => {
      mockCreateMCPClient.mockRejectedValue(new Error('ECONNREFUSED'));

      const connectPromise = mcpClient.onModuleInit();

      // Advance through all retry delays
      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(1000 * Math.pow(2, i));
      }

      await connectPromise;

      // Should be disconnected but not throw
      expect(mcpClient.isConnected()).toBe(false);

      // getTools should return empty
      const tools = await mcpClient.getTools();
      expect(tools).toEqual({});
    });
  });
});
