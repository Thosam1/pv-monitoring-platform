import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolsHttpClient } from './tools-http.client';

/**
 * Create LangChain-compatible tools that wrap the existing HTTP tool client.
 *
 * These tools call the Python solar-analyst HTTP API via ToolsHttpClient.
 * The tool definitions mirror those in tool-definitions.ts but use LangChain's
 * tool interface instead of Vercel AI SDK.
 *
 * @param httpClient - The HTTP client for making tool calls to Python service
 * @returns Array of LangChain tools
 */
export function createLangChainTools(httpClient: ToolsHttpClient) {
  return [
    // Discovery tool - must be called first to find valid logger IDs
    tool(
      async () => {
        const result = await httpClient.executeTool('list_loggers', {});
        return JSON.stringify(result);
      },
      {
        name: 'list_loggers',
        description:
          'List all available loggers/inverters in the system. Returns logger IDs, types, and data date ranges. Use this FIRST to discover valid logger IDs before calling other tools.',
        schema: z.object({}),
      },
    ),

    // Health analysis tool
    tool(
      async ({ logger_id, days = 7 }) => {
        const result = await httpClient.executeTool('analyze_inverter_health', {
          logger_id,
          days,
        });
        return JSON.stringify(result);
      },
      {
        name: 'analyze_inverter_health',
        description:
          'Analyze inverter health by detecting anomalies like daytime outages (power = 0 when irradiance > 50 W/m2).',
        schema: z.object({
          logger_id: z.string().describe('Logger/inverter serial number'),
          days: z
            .number()
            .min(1)
            .max(365)
            .default(7)
            .describe('Number of days to analyze'),
        }),
      },
    ),

    // Power curve data tool
    tool(
      async ({ logger_id, date }) => {
        const result = await httpClient.executeTool('get_power_curve', {
          logger_id,
          date,
        });
        return JSON.stringify(result);
      },
      {
        name: 'get_power_curve',
        description:
          'Get power and irradiance timeseries for a specific date. Returns data suitable for charting.',
        schema: z.object({
          logger_id: z.string().describe('Logger/inverter serial number'),
          date: z.string().describe('Date in YYYY-MM-DD format'),
        }),
      },
    ),

    // Multi-logger comparison tool
    tool(
      async ({ logger_ids, metric = 'power', date }) => {
        const result = await httpClient.executeTool('compare_loggers', {
          logger_ids,
          metric,
          date,
        });
        return JSON.stringify(result);
      },
      {
        name: 'compare_loggers',
        description:
          'Compare multiple loggers on a specific metric for a given date. Returns merged timeseries data suitable for multi-line charts.',
        schema: z.object({
          logger_ids: z
            .array(z.string())
            .min(2)
            .max(5)
            .describe('List of logger IDs to compare (2-5)'),
          metric: z
            .enum(['power', 'energy', 'irradiance'])
            .default('power')
            .describe("Metric to compare: 'power', 'energy', or 'irradiance'"),
          date: z
            .string()
            .optional()
            .describe('Date in YYYY-MM-DD format (optional)'),
        }),
      },
    ),

    // Financial savings calculator
    tool(
      async ({ logger_id, start_date, end_date, electricity_rate = 0.2 }) => {
        const result = await httpClient.executeTool(
          'calculate_financial_savings',
          {
            logger_id,
            start_date,
            end_date,
            electricity_rate,
          },
        );
        return JSON.stringify(result);
      },
      {
        name: 'calculate_financial_savings',
        description:
          'Calculate financial savings from solar generation. Returns money saved, CO2 offset, and trees equivalent.',
        schema: z.object({
          logger_id: z.string().describe('Logger/inverter serial number'),
          start_date: z.string().describe('Start date in YYYY-MM-DD format'),
          end_date: z
            .string()
            .optional()
            .describe(
              'End date in YYYY-MM-DD format (optional, defaults to today)',
            ),
          electricity_rate: z
            .number()
            .min(0.01)
            .max(1)
            .default(0.2)
            .describe('Electricity rate in $/kWh (default 0.20)'),
        }),
      },
    ),

    // Performance ratio calculator
    tool(
      async ({ logger_id, date, capacity_kw }) => {
        const result = await httpClient.executeTool(
          'calculate_performance_ratio',
          {
            logger_id,
            date,
            capacity_kw,
          },
        );
        return JSON.stringify(result);
      },
      {
        name: 'calculate_performance_ratio',
        description:
          'Calculate the Performance Ratio (efficiency) for a system on a given date.',
        schema: z.object({
          logger_id: z.string().describe('Logger/inverter serial number'),
          date: z.string().describe('Date in YYYY-MM-DD format'),
          capacity_kw: z
            .number()
            .optional()
            .describe(
              'Override system capacity in kW (optional, auto-inferred if not provided)',
            ),
        }),
      },
    ),

    // Production forecast tool
    tool(
      async ({ logger_id, days_ahead = 1 }) => {
        const result = await httpClient.executeTool('forecast_production', {
          logger_id,
          days_ahead,
        });
        return JSON.stringify(result);
      },
      {
        name: 'forecast_production',
        description:
          'Forecast energy production for upcoming days using historical average.',
        schema: z.object({
          logger_id: z.string().describe('Logger/inverter serial number'),
          days_ahead: z
            .number()
            .min(1)
            .max(7)
            .default(1)
            .describe('Number of days to forecast (1-7)'),
        }),
      },
    ),

    // Error diagnostics tool
    tool(
      async ({ logger_id, days = 7 }) => {
        const result = await httpClient.executeTool('diagnose_error_codes', {
          logger_id,
          days,
        });
        return JSON.stringify(result);
      },
      {
        name: 'diagnose_error_codes',
        description:
          'Diagnose system errors by scanning metadata for error codes. Returns human-readable descriptions and suggested fixes.',
        schema: z.object({
          logger_id: z.string().describe('Logger/inverter serial number'),
          days: z
            .number()
            .min(1)
            .max(30)
            .default(7)
            .describe('Number of days to scan for errors (1-30)'),
        }),
      },
    ),

    // Fleet overview tool
    tool(
      async () => {
        const result = await httpClient.executeTool('get_fleet_overview', {});
        return JSON.stringify(result);
      },
      {
        name: 'get_fleet_overview',
        description:
          'Get high-level status of the entire solar fleet (site-wide). Returns total current power, total daily energy, and active device counts.',
        schema: z.object({}),
      },
    ),

    // Health check tool
    tool(
      async () => {
        const result = await httpClient.executeTool('health_check', {});
        return JSON.stringify(result);
      },
      {
        name: 'health_check',
        description: 'Check service health and database connectivity.',
        schema: z.object({}),
      },
    ),
  ];
}

/**
 * Suggestion item schema for contextual follow-up actions.
 */
const SuggestionItemSchema = z.object({
  label: z.string().describe('Display label for the suggestion chip'),
  action: z
    .string()
    .describe('Natural language action to execute when clicked'),
  priority: z
    .enum(['primary', 'secondary'])
    .describe('Visual prominence of the suggestion'),
});

/**
 * Flow hint schema for request_user_selection.
 */
const FlowHintSchema = z.object({
  expectedNext: z
    .string()
    .describe('Description of what will happen after selection'),
  skipOption: z
    .object({
      label: z.string().describe('Label for the skip option'),
      action: z.string().describe('Action to execute if skipped'),
    })
    .optional()
    .describe('Optional skip option for users who want to use defaults'),
});

/**
 * Create UI pass-through tools for frontend rendering.
 *
 * These tools are NOT executed by the backend - their arguments are
 * passed through to the frontend for rendering interactive components.
 *
 * Extended with suggestions schema for explicit flow support.
 *
 * @returns Array of UI pass-through tools
 */
export function createUiTools() {
  return [
    // Chart rendering tool (pass-through to frontend)
    tool(
      (args) => {
        // This tool is not actually executed - it's intercepted and passed to frontend
        // Return the args so they appear in the tool call for frontend to handle
        return JSON.stringify({
          _passthrough: true,
          component: args.component,
          props: args.props as Record<string, unknown>,
          suggestions: args.suggestions,
        });
      },
      {
        name: 'render_ui_component',
        description:
          'Render charts and visualizations in the UI. Use DynamicChart for flexible AI-generated visualizations. Include suggestions for contextual follow-up actions.',
        schema: z.object({
          component: z
            .enum([
              'PerformanceChart',
              'TechnicalChart',
              'KPIGrid',
              'AnomalyTable',
              'ComparisonChart',
              'DynamicChart',
              'FleetOverview',
              'FinancialReport',
              'HealthReport',
            ])
            .describe(
              'The component to render. Use DynamicChart for flexible AI-generated visualizations.',
            ),
          props: z
            .any()
            .describe(
              'Props to pass to the component. For DynamicChart: { chartType, title, xAxisKey, series, data }',
            ),
          suggestions: z
            .array(SuggestionItemSchema)
            .optional()
            .describe(
              'Contextual follow-up suggestions to show after the component',
            ),
        }),
      },
    ),

    // User selection prompt tool (pass-through to frontend)
    tool(
      (args) => {
        // This tool is not actually executed - it's intercepted and passed to frontend
        return JSON.stringify({
          _passthrough: true,
          prompt: args.prompt,
          options: args.options,
          selectionType: args.selectionType,
          inputType: args.inputType,
          minDate: args.minDate,
          maxDate: args.maxDate,
          flowHint: args.flowHint,
        });
      },
      {
        name: 'request_user_selection',
        description:
          'Request user to select from a list of options. Use when you need the user to choose a logger, date, or other option. The frontend will render an interactive dropdown or date picker.',
        schema: z.object({
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
          flowHint: FlowHintSchema.optional().describe(
            'Flow context hint for the frontend to show what happens next',
          ),
        }),
      },
    ),
  ];
}

/**
 * Get all tools (solar analyst + UI) as a single array.
 */
export function getAllTools(httpClient: ToolsHttpClient) {
  return [...createLangChainTools(httpClient), ...createUiTools()];
}
