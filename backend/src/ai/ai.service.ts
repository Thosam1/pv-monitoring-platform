import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText, tool, CoreMessage, LanguageModel, stepCountIs } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { McpClient } from './mcp.client';
import { RENDER_UI_COMPONENT_SCHEMA } from './interfaces/render-ui-component.interface';

/**
 * System prompt for the Solar Analytics Assistant.
 * Defines available tools and usage rules.
 */
const SYSTEM_PROMPT = `You are the Solar Analytics Assistant for a PV monitoring platform.

TOOLS AVAILABLE:

**Discovery & Monitoring:**
- list_loggers: Discover all available inverters/loggers. Use this FIRST to find valid IDs.
- analyze_inverter_health: Detect anomalies like daytime outages (power=0 when irradiance>50).
- get_power_curve: Get timeseries data for a single logger on a specific date.
- compare_loggers: Compare 2-5 loggers on power/energy/irradiance metrics.

**Financial & Insights:**
- calculate_financial_savings: Calculate money saved, CO2 offset, and trees equivalent from solar generation. Requires start_date, optional end_date and electricity_rate.
- calculate_performance_ratio: Check system efficiency by comparing actual vs theoretical output. Auto-infers system capacity from peak power.
- forecast_production: Predict future energy generation using historical averages. Returns forecasts with confidence levels.
- diagnose_error_codes: Scan for system errors in metadata. Returns human-readable descriptions and suggested fixes.

**UI Rendering:**
- render_ui_component: Render charts in the UI with data from analysis.

RULES:
1. ALWAYS call list_loggers first if the user refers to a logger by name/type instead of ID.
2. After getting data from analysis tools, call render_ui_component to visualize results when appropriate.
3. DO NOT write text descriptions of charts or Markdown tables for data visualization.
4. Use compare_loggers when asked to compare multiple inverters.
5. Be concise in your responses. Focus on insights, not data dumps.
6. For financial questions ("How much did I save?"), use calculate_financial_savings.
7. For efficiency questions ("Is my system working well?"), use calculate_performance_ratio.
8. For prediction questions ("How much will I generate tomorrow?"), use forecast_production.
9. For troubleshooting ("Any errors?", "What does this error mean?"), use diagnose_error_codes.

COMPONENT MAPPING:
- For power curves and timeseries: use PerformanceChart
- For anomaly reports: use AnomalyTable
- For logger comparisons: use ComparisonChart
- For summary statistics/financial reports: use KPIGrid
- For diagnostics/error reports: use AnomalyTable`;

type AIProvider = 'gemini' | 'anthropic' | 'openai';

/**
 * AI Service for handling chat interactions with multi-provider LLM support.
 *
 * Features:
 * - Multi-provider support (Gemini, Anthropic, OpenAI)
 * - MCP tool integration
 * - Streaming responses
 * - Pass-through render_ui_component tool
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mcpClient: McpClient,
  ) {
    this.logger.log(
      `AI Service initialized with provider: ${this.getProvider()}`,
    );
  }

  /**
   * Get the configured AI provider.
   */
  private getProvider(): AIProvider {
    const provider = this.configService.get<string>('AI_PROVIDER', 'gemini');
    if (['gemini', 'anthropic', 'openai'].includes(provider)) {
      return provider as AIProvider;
    }
    this.logger.warn(
      `Invalid AI_PROVIDER "${provider}", falling back to gemini`,
    );
    return 'gemini';
  }

  /**
   * Get the language model based on the configured provider.
   */
  private getModel(): LanguageModel {
    const provider = this.getProvider();

    switch (provider) {
      case 'anthropic': {
        const anthropicKey =
          this.configService.get<string>('ANTHROPIC_API_KEY');
        if (!anthropicKey) {
          throw new Error(
            'ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic',
          );
        }
        const anthropic = createAnthropic({ apiKey: anthropicKey });
        const model = this.configService.get<string>(
          'ANTHROPIC_MODEL',
          'claude-3-5-sonnet-20241022',
        );
        this.logger.debug(`Using Anthropic model: ${model}`);
        return anthropic(model);
      }

      case 'openai': {
        const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!openaiKey) {
          throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
        }
        const openai = createOpenAI({ apiKey: openaiKey });
        const model = this.configService.get<string>('OPENAI_MODEL', 'gpt-4o');
        this.logger.debug(`Using OpenAI model: ${model}`);
        return openai(model);
      }

      case 'gemini':
      default: {
        const googleKey = this.configService.get<string>(
          'GOOGLE_GENERATIVE_AI_API_KEY',
        );
        if (!googleKey) {
          throw new Error(
            'GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER=gemini',
          );
        }
        const google = createGoogleGenerativeAI({ apiKey: googleKey });
        const model = this.configService.get<string>(
          'GEMINI_MODEL',
          'gemini-1.5-flash',
        );
        this.logger.debug(`Using Gemini model: ${model}`);
        return google(model);
      }
    }
  }

  /**
   * Build the tools object combining MCP tools and the render_ui_component tool.
   */

  private async buildTools(): Promise<Record<string, any>> {
    const tools: Record<string, any> = {};

    // Get MCP tools from the Python service
    const mcpTools = await this.mcpClient.getTools();
    for (const [name, mcpTool] of Object.entries(mcpTools)) {
      tools[name] = mcpTool;
    }

    // Add the render_ui_component tool (pass-through)
    // CRITICAL: This tool is NOT executed by the backend.
    // Its arguments are passed through to the frontend.
    tools['render_ui_component'] = tool({
      description: RENDER_UI_COMPONENT_SCHEMA.description,
      inputSchema: z.object({
        component: z
          .enum([
            'PerformanceChart',
            'TechnicalChart',
            'KPIGrid',
            'AnomalyTable',
            'ComparisonChart',
          ])
          .describe('The component to render'),
        props: z
          .record(z.string(), z.unknown())
          .describe('Props to pass to the component'),
      }),
      // No execute function - this is a pass-through tool
      // The tool invocation will be included in the response for the frontend to handle
    });

    this.logger.debug(`Built ${Object.keys(tools).length} tools for AI`);
    return tools;
  }

  /**
   * Process a chat request and return a streaming response.
   *
   * @param messages - The conversation history
   * @returns Streaming result with text and tool invocations
   */

  async chat(messages: CoreMessage[]): Promise<any> {
    const model = this.getModel();
    const tools = await this.buildTools();

    this.logger.log(`Processing chat with ${messages.length} messages`);

    // Add system message if not present
    const fullMessages: CoreMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages,
    ];

    const result = streamText({
      model,
      messages: fullMessages,
      tools,
      stopWhen: stepCountIs(10), // Allow multiple tool calls in sequence (v5 API)

      onStepFinish: ({ text, toolCalls, toolResults }: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (toolCalls?.length) {
          this.logger.debug(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            `Tool calls: ${toolCalls.map((t: { toolName: string }) => t.toolName).join(', ')}`,
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (toolResults?.length) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          this.logger.debug(`Tool results received: ${toolResults.length}`);
        }
        if (text) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          this.logger.debug(`Generated text: ${text.substring(0, 100)}...`);
        }
      },
    });

    return result;
  }

  /**
   * Check if the AI service is properly configured and ready.
   */
  isReady(): boolean {
    try {
      // Check if we can get a model (validates API key)
      this.getModel();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current provider and model information.
   */
  getStatus(): { provider: AIProvider; mcpConnected: boolean; ready: boolean } {
    return {
      provider: this.getProvider(),
      mcpConnected: this.mcpClient.isConnected(),
      ready: this.isReady(),
    };
  }
}
