import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Tool schema returned from the Python HTTP API.
 */
interface ToolSchema {
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description?: string;
      required?: boolean;
      default?: unknown;
      items?: { type: string };
    }
  >;
}

/**
 * Response from tool execution.
 */
interface ToolResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
}

/**
 * HTTP Client for calling Python solar-analyst tools.
 *
 * Stateless HTTP calls replace the session-based SSE transport.
 * Each tool call is an independent HTTP POST request.
 */
@Injectable()
export class ToolsHttpClient implements OnModuleInit {
  private readonly logger = new Logger(ToolsHttpClient.name);
  private readonly baseUrl: string;
  private toolSchemas: Record<string, ToolSchema> = {};

  constructor(private readonly configService: ConfigService) {
    // Get base URL and strip /sse suffix if present (for backwards compatibility)
    let url = this.configService.get<string>(
      'MCP_SERVER_URL',
      'http://localhost:4000',
    );
    url = url.replace('/sse', '');
    this.baseUrl = url;
    this.logger.log(
      `ToolsHttpClient configured with base URL: ${this.baseUrl}`,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.loadToolSchemas();
  }

  /**
   * Load tool schemas from the Python API.
   */
  private async loadToolSchemas(): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `Loading tool schemas from ${this.baseUrl}/api/tools (attempt ${attempt}/${maxRetries})`,
        );

        const response = await fetch(`${this.baseUrl}/api/tools`);
        if (!response.ok) {
          throw new Error(`Failed to load tool schemas: ${response.status}`);
        }

        const data = (await response.json()) as {
          tools: Record<string, ToolSchema>;
        };
        this.toolSchemas = data.tools;
        this.logger.log(
          `Loaded ${Object.keys(this.toolSchemas).length} tool schemas: ${Object.keys(this.toolSchemas).join(', ')}`,
        );
        return;
      } catch (error) {
        this.logger.warn(`Failed to load tool schemas: ${error}`);

        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    // Don't throw - allow service to start without tools
    this.logger.error(
      `Failed to load tool schemas after ${maxRetries} attempts. AI features will be limited.`,
    );
  }

  /**
   * Check if connected (has tool schemas).
   */
  isConnected(): boolean {
    return Object.keys(this.toolSchemas).length > 0;
  }

  /**
   * Get available tool schemas.
   */
  getToolSchemas(): Record<string, ToolSchema> {
    return this.toolSchemas;
  }

  /**
   * Execute a tool by name with given arguments.
   *
   * @param toolName - The name of the tool to execute
   * @param args - Arguments to pass to the tool
   * @returns The tool execution result
   * @throws Error if the tool execution fails
   */
  async executeTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}/api/tools/${toolName}`;

    this.logger.debug(
      `Calling tool ${toolName} with args: ${JSON.stringify(args)}`,
    );

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(args),
      });

      const data = (await response.json()) as ToolResponse<T>;

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `Tool ${toolName} execution failed`;
        this.logger.error(`Tool ${toolName} failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      this.logger.debug(`Tool ${toolName} returned successfully`);
      return data.result as T;
    } catch (error) {
      if (error instanceof Error) {
        this.logger.error(`Tool ${toolName} error: ${error.message}`);
        throw error;
      }
      throw new Error(`Unknown error calling tool ${toolName}`);
    }
  }

  /**
   * Refresh tool schemas (for reconnection scenarios).
   */
  async refresh(): Promise<void> {
    this.toolSchemas = {};
    await this.loadToolSchemas();
  }

  /**
   * Sleep helper for retry delays.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
