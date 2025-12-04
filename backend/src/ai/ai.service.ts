import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText, tool, LanguageModel, stepCountIs } from 'ai';

/**
 * Message type for AI chat (replaces deprecated CoreMessage).
 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { ToolsHttpClient } from './tools-http.client';
import { createSolarAnalystTools } from './tool-definitions';
import { RENDER_UI_COMPONENT_SCHEMA } from './interfaces/render-ui-component.interface';

/**
 * System prompt for the Solar Analytics Assistant.
 * Organized into sections with explicit rule evaluation order.
 */
const SYSTEM_PROMPT = `You are the Solar Analytics Assistant for a PV monitoring platform.

# TOOLS AVAILABLE

## Discovery & Monitoring
- list_loggers: Discover all available inverters/loggers. Use this FIRST to find valid IDs.
- get_fleet_overview: Get site-wide status (total power, energy, active devices). Use for "How is the site performing?" or "Give me a morning briefing".
- analyze_inverter_health: Detect anomalies like daytime outages (power=0 when irradiance>50).
- get_power_curve: Get timeseries data for a single logger on a specific date.
- compare_loggers: Compare 2-5 loggers on power/energy/irradiance metrics.

## Financial & Insights
- calculate_financial_savings: Calculate money saved, CO2 offset, and trees equivalent from solar generation.
- calculate_performance_ratio: Check system efficiency by comparing actual vs theoretical output.
- forecast_production: Predict future energy generation using historical averages.
- diagnose_error_codes: Scan for system errors in metadata.

## UI Rendering & User Interaction
- render_ui_component: Render charts in the UI with data from analysis.
- request_user_selection: Show an interactive dropdown for user to select an option.

---

# RULE EVALUATION ORDER

When processing tool results, evaluate rules in this STRICT order:

1. **RECOVERY RULES** - Check FIRST if tool returned error/no-data status
2. **TOOL SELECTION RULES** - Which tool to call for the user's request
3. **UI RENDERING RULES** - How to display successful results
4. **NARRATIVE RULES** - What to say about the data
5. **CONVERSATION FLOW RULES** - How to interact with the user

---

# RECOVERY RULES (Evaluate FIRST - before any rendering)

## RULE R1: Data Recovery (status='no_data_in_window')
**PRECONDITION:** Tool returns status='no_data_in_window' with availableRange
**ACTION:**
  a) INFORM: "I found no data for [requested date], but records exist from [start] to [end]."
  b) CALL request_user_selection with:
     - inputType: 'date' or 'date-range'
     - minDate: availableRange.start
     - maxDate: availableRange.end
     - Generate smart presets based on available range
  c) STOP - Do NOT render charts or narratives for missing data
**TOOLS:** get_power_curve, compare_loggers, calculate_performance_ratio, analyze_inverter_health

## RULE R2: No Data Available (status='no_data')
**PRECONDITION:** Tool returns status='no_data' (logger has zero records)
**ACTION:**
  a) INFORM: "This logger doesn't have any data yet."
  b) SUGGEST: "You can upload data via the Upload page, or verify the logger ID is correct."
  c) OFFER: Call list_loggers to show available loggers
  d) STOP - Do NOT render charts or narratives

## RULE R3: Tool Failure
**PRECONDITION:** Tool call fails or returns error
**ACTION:**
  - DO NOT say "Try again later"
  - EXPLAIN why it failed with actionable guidance
  - PROVIDE a next step the user can take

---

# UI RENDERING RULES (Only if data exists)

## RULE U1: Narrative Insights (summaryStats available)
**PRECONDITION:** Tool returns data with summaryStats object
**ACTION:** After rendering chart, describe the key metrics:
  a) Peak: "Peak of {peakValue}W at {peakTime}"
  b) Average: "Average output was {avgValue}W"
  c) Trend: "Production was {trend} through the day"
  d) Energy: "Total generation: {totalEnergy} kWh"

## RULE U2: Post-Chart Narrative (MANDATORY)
**PRECONDITION:** About to call render_ui_component for a chart
**ACTION:**
  1. Render the chart via render_ui_component
  2. ALWAYS provide 1-2 sentences analyzing the data
     - Use summaryStats if available
     - Otherwise use date, logger ID, record count
  3. Suggest ONE relevant follow-up action
**FALLBACK:** "Here's the power curve for [logger] on [date]. What would you like to explore next?"

## RULE U3: Pre-Selection Context
**PRECONDITION:** About to call request_user_selection
**ACTION:** Write brief context before showing the dropdown
  - GOOD: "I found 12 loggers - 8 inverters and 4 weather stations:"
  - BAD: [Immediately show dropdown without explanation]

---

# TOOL SELECTION RULES

## RULE T1: Logger Discovery
ALWAYS call list_loggers first if user refers to logger by name/type instead of ID.

## RULE T2: Visualization
After getting data from analysis tools, call render_ui_component to visualize results.

## RULE T3: No Text Charts
DO NOT write text descriptions of charts or Markdown tables for data visualization.

## RULE T4: Comparison
Use compare_loggers when asked to compare multiple inverters.

## RULE T5: Financial
For "How much did I save?" questions, use calculate_financial_savings.

## RULE T6: Efficiency
For "Is my system working well?" questions, use calculate_performance_ratio.

## RULE T7: Prediction
For "How much will I generate?" questions, use forecast_production.

## RULE T8: Troubleshooting
For "Any errors?" questions, use diagnose_error_codes.

## RULE T9: Site Overview
For "How is the site?" or "Morning briefing" questions, use get_fleet_overview.

---

# CONVERSATION FLOW RULES

## RULE C1: No Plain Text Questions
NEVER ask clarifying questions in plain text. ALWAYS use request_user_selection for user input.

## RULE C2: Logger Selection Flow
When logger not specified:
  a) Call list_loggers
  b) Call request_user_selection with options grouped by type
  c) Include subtitle with logger type (e.g., "Inverter" or "Weather Station")

## RULE C3: Smart Date Selection
For date-related queries:
  a) Extract earliestData and latestData from logger metadata
  b) DEFAULT: Auto-use latest date without prompting
  c) ONLY show date picker when user explicitly requests a specific date
  d) When showing picker, set minDate/maxDate and generate smart presets

## RULE C4: Logger Before Date
When both logger AND date are missing, ask for logger first. Auto-use latest date after selection.

## RULE C5: Temporal Words
| User Says              | Action                           |
|------------------------|----------------------------------|
| "oldest", "first"      | Use earliestData                 |
| "latest", "newest"     | Use latestData                   |
| "yesterday", "today"   | Calculate relative to current    |
ALWAYS tell user what date you're using.

## RULE C6: Concise Responses
Be concise. Focus on insights, not data dumps.

---

# PLAYBOOKS (Multi-Step Workflows)

## PLAYBOOK: "Morning Briefing" / "Fleet Overview"
1. Call get_fleet_overview
2. IF percentOnline < 100%, call diagnose_error_codes for offline devices
3. Present summary: online count, total power, critical issues

## PLAYBOOK: "Performance Audit"
1. Call calculate_performance_ratio for requested logger(s)
2. IF variance > 10% across multiple loggers, call compare_loggers
3. Highlight best and worst performers

## PLAYBOOK: "Financial Report"
1. Call calculate_financial_savings (default: 30 days)
2. Call forecast_production (default: 7 days)
3. Present together: "You saved $X, expecting $Y next week"

## PLAYBOOK: "Health Check"
1. Call analyze_inverter_health (default: 7 days)
2. IF anomalies found: call diagnose_error_codes, offer get_power_curve
3. IF no anomalies: confirm system is healthy

---

# REASONING RULES

## The "Don't Ask, Look" Rule
If user mentions "inverters" or "health" without ID:
- DO NOT ask "Which one?"
- IMMEDIATELY call list_loggers, then request_user_selection

## The "One-Click Analysis" Rule
For system-wide analysis:
- Call list_loggers first
- IF ≤3 loggers: Analyze ALL automatically
- IF >3 loggers: Use request_user_selection

---

# COMPONENT MAPPING

## DynamicChart (Preferred)
| Data Type                    | chartType | Series Styling                    |
|------------------------------|-----------|-----------------------------------|
| Single logger power          | composed  | Power: #FDB813, Irradiance: #3B82F6 |
| Multiple loggers comparison  | line      | Different colors per logger       |
| Daily/weekly energy          | bar       | Energy: #22C55E                   |
| Power vs Irradiance          | scatter   | Correlation analysis              |
| Fleet status                 | pie       | Online: green, Offline: red       |

## Legacy Components
- PerformanceChart: power curves
- AnomalyTable: anomaly reports, diagnostics
- ComparisonChart: logger comparisons
- KPIGrid: summary statistics, fleet overview`;

type AIProvider = 'gemini' | 'anthropic' | 'openai';

/**
 * AI Service for handling chat interactions with multi-provider LLM support.
 *
 * Features:
 * - Multi-provider support (Gemini, Anthropic, OpenAI)
 * - HTTP-based tool integration (stateless, no SSE sessions)
 * - Streaming responses
 * - Pass-through render_ui_component tool
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsHttpClient: ToolsHttpClient,
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
   * Build the tools object combining solar analyst tools and UI pass-through tools.
   */

  private buildTools(): Record<string, any> {
    // Get solar analyst tools with HTTP execute functions
    const solarTools = createSolarAnalystTools(this.toolsHttpClient);

    // Add the render_ui_component tool (pass-through)
    // CRITICAL: This tool is NOT executed by the backend.
    // Its arguments are passed through to the frontend.
    const renderUiComponent = tool({
      description: RENDER_UI_COMPONENT_SCHEMA.description,
      inputSchema: z.object({
        component: z
          .enum([
            'PerformanceChart',
            'TechnicalChart',
            'KPIGrid',
            'AnomalyTable',
            'ComparisonChart',
            'DynamicChart',
          ])
          .describe(
            'The component to render. Use DynamicChart for flexible AI-generated visualizations.',
          ),
        props: z
          .record(z.string(), z.unknown())
          .describe(
            'Props to pass to the component. For DynamicChart: { chartType, title, xAxisKey, series, data }',
          ),
      }),
      // No execute function - this is a pass-through tool
      // The tool invocation will be included in the response for the frontend to handle
    });

    // Add the request_user_selection tool (pass-through)
    // Renders an interactive selection UI in the frontend
    const requestUserSelection = tool({
      description:
        'Request user to select from a list of options. Use when you need the user to choose a logger, date, or other option. The frontend will render an interactive dropdown or date picker.',
      inputSchema: z.object({
        prompt: z
          .string()
          .describe(
            'The question to ask the user (e.g., "Which logger would you like to analyze?")',
          ),
        options: z
          .array(
            z.object({
              value: z.string().describe('The value to use when selected'),
              label: z.string().describe('Display label for the option'),
              group: z
                .string()
                .optional()
                .describe('Group name for categorizing options'),
              subtitle: z
                .string()
                .optional()
                .describe('Additional info shown below the label'),
            }),
          )
          .describe('List of options for the user to choose from'),
        selectionType: z
          .enum(['single', 'multiple'])
          .default('single')
          .describe('Whether user can select one or multiple options'),
        inputType: z
          .enum(['dropdown', 'date', 'date-range'])
          .default('dropdown')
          .describe(
            'UI type: dropdown for standard selection, date for single date picker, date-range for selecting a date range',
          ),
        minDate: z
          .string()
          .optional()
          .describe(
            'Minimum selectable date in ISO format (YYYY-MM-DD). Used with inputType=date or date-range to disable earlier dates.',
          ),
        maxDate: z
          .string()
          .optional()
          .describe(
            'Maximum selectable date in ISO format (YYYY-MM-DD). Used with inputType=date or date-range to disable later dates.',
          ),
      }),
      // No execute function - pass-through to frontend
    });

    const tools = {
      ...solarTools,
      render_ui_component: renderUiComponent,
      request_user_selection: requestUserSelection,
    };

    this.logger.debug(`Built ${Object.keys(tools).length} tools for AI`);
    return tools;
  }

  /**
   * Sanitize messages to ensure they have valid content.
   * Filters out empty messages and ensures proper format for Gemini.
   */
  private sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((msg) => {
      // Filter out messages with empty or whitespace-only content
      if (!msg.content || msg.content.trim().length === 0) {
        this.logger.debug(`Filtering out empty ${msg.role} message`);
        return false;
      }
      return true;
    });
  }

  /**
   * Process a chat request and return a streaming response.
   *
   * @param messages - The conversation history
   * @returns Streaming result with text and tool invocations
   */
  chat(messages: ChatMessage[]) {
    const model = this.getModel();
    const tools = this.buildTools();

    this.logger.log(`Processing chat with ${messages.length} messages`);

    // Sanitize messages - filter out empty content
    const sanitizedMessages = this.sanitizeMessages(messages);
    this.logger.debug(
      `Sanitized ${messages.length} messages to ${sanitizedMessages.length}`,
    );

    // Add system message if not present
    const fullMessages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...sanitizedMessages,
    ];

    // Ensure we have at least one user message
    const hasUserMessage = fullMessages.some((msg) => msg.role === 'user');
    if (!hasUserMessage) {
      this.logger.warn('No valid user message found after sanitization');
      throw new Error('At least one user message with content is required');
    }

    const result = streamText({
      model,
      messages: fullMessages,
      tools,
      stopWhen: stepCountIs(10), // Allow multiple tool calls in sequence (v5 API)

      onStepFinish: ({ text, toolCalls, toolResults }) => {
        if (toolCalls?.length) {
          this.logger.debug(
            `Tool calls: ${toolCalls.map((t: { toolName: string }) => t.toolName).join(', ')}`,
          );
        }
        if (toolResults?.length) {
          this.logger.debug(`Tool results received: ${toolResults.length}`);
        }
        if (text) {
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
      mcpConnected: this.toolsHttpClient.isConnected(),
      ready: this.isReady(),
    };
  }
}
