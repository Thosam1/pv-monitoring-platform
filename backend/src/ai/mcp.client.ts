import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { experimental_createMCPClient as createMCPClient } from '@ai-sdk/mcp';

/**
 * MCP Client type from the experimental API.
 * Using 'unknown' to work around TypeScript inference issues with experimental APIs.
 */
interface MCPClientInstance {
  tools(): Promise<Record<string, unknown>>;
  close(): Promise<void>;
}

/**
 * MCP Client service for connecting to the Python FastMCP server.
 *
 * Uses SSE transport to communicate with the AI analysis service.
 * Implements connection retry with exponential backoff.
 */
@Injectable()
export class McpClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpClient.name);
  private client: MCPClientInstance | null = null;
  private readonly maxRetries = 5;
  private readonly baseDelay = 1000; // 1 second

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    // Connect on module initialization
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  /**
   * Get the MCP server URL from configuration.
   */
  private getServerUrl(): string {
    return this.configService.get<string>(
      'MCP_SERVER_URL',
      'http://localhost:4000/sse',
    );
  }

  /**
   * Connect to the MCP server with exponential backoff retry.
   */
  async connect(): Promise<void> {
    const serverUrl = this.getServerUrl();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.log(
          `Connecting to MCP server at ${serverUrl} (attempt ${attempt}/${this.maxRetries})`,
        );

        // The experimental API doesn't have proper types, so we cast to our interface

        const client = await createMCPClient({
          transport: {
            type: 'sse',
            url: serverUrl,
          },
        });
        this.client = client as MCPClientInstance;

        this.logger.log('Successfully connected to MCP server');
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Failed to connect to MCP server: ${lastError.message}`,
        );

        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // Don't throw - allow the service to start without MCP connection
    // Tools will be empty if MCP server is not available
    this.logger.error(
      `Failed to connect to MCP server after ${this.maxRetries} attempts. ` +
        `AI features will be limited. Error: ${lastError?.message}`,
    );
  }

  /**
   * Close the MCP client connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        this.logger.log('MCP client connection closed');
      } catch (error) {
        this.logger.warn(`Error closing MCP client: ${error}`);
      }
      this.client = null;
    }
  }

  /**
   * Check if the client is connected.
   */
  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Get available tools from the MCP server.
   * Returns an empty object if not connected.
   */
  async getTools(): Promise<Record<string, unknown>> {
    if (!this.client) {
      this.logger.warn('MCP client not connected, returning empty tools');
      return {};
    }

    try {
      const tools = await this.client.tools();
      this.logger.debug(
        `Retrieved ${Object.keys(tools).length} tools from MCP server`,
      );
      return tools;
    } catch (error) {
      this.logger.error(`Failed to get tools from MCP server: ${error}`);
      // Try to reconnect
      await this.reconnect();
      return {};
    }
  }

  /**
   * Attempt to reconnect to the MCP server.
   */
  private async reconnect(): Promise<void> {
    this.logger.log('Attempting to reconnect to MCP server...');
    await this.close();
    await this.connect();
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
