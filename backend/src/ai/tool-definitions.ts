import { tool } from 'ai';
import { z } from 'zod';
import { ToolsHttpClient } from './tools-http.client';

/**
 * Create AI SDK tools that call the Python HTTP API.
 *
 * Each tool has:
 * - description: Used by the LLM to understand when to use the tool
 * - inputSchema: Zod schema for parameter validation (AI SDK v5)
 * - execute: Async function that calls the Python API
 *
 * @param httpClient - The HTTP client instance for making tool calls
 * @returns Record of AI SDK tool definitions
 */
export function createSolarAnalystTools(httpClient: ToolsHttpClient) {
  return {
    list_loggers: tool({
      description:
        'List all available loggers/inverters in the system. Returns logger IDs, types, and data date ranges. Use this FIRST to discover valid logger IDs before calling other tools.',
      inputSchema: z.object({}),
      execute: async () => {
        return httpClient.executeTool('list_loggers', {});
      },
    }),

    analyze_inverter_health: tool({
      description:
        'Analyze inverter health by detecting anomalies like daytime outages (power = 0 when irradiance > 50 W/m2).',
      inputSchema: z.object({
        logger_id: z.string().describe('Logger/inverter serial number'),
        days: z
          .number()
          .min(1)
          .max(365)
          .default(7)
          .describe('Number of days to analyze'),
      }),
      execute: async (args) => {
        return httpClient.executeTool('analyze_inverter_health', {
          logger_id: args.logger_id,
          days: args.days,
        });
      },
    }),

    get_power_curve: tool({
      description:
        'Get power and irradiance timeseries for a specific date. Returns data suitable for charting.',
      inputSchema: z.object({
        logger_id: z.string().describe('Logger/inverter serial number'),
        date: z.string().describe('Date in YYYY-MM-DD format'),
      }),
      execute: async (args) => {
        return httpClient.executeTool('get_power_curve', {
          logger_id: args.logger_id,
          date: args.date,
        });
      },
    }),

    compare_loggers: tool({
      description:
        'Compare multiple loggers on a specific metric for a given date. Returns merged timeseries data suitable for multi-line charts.',
      inputSchema: z.object({
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
      execute: async (args) => {
        return httpClient.executeTool('compare_loggers', {
          logger_ids: args.logger_ids,
          metric: args.metric,
          date: args.date,
        });
      },
    }),

    calculate_financial_savings: tool({
      description:
        'Calculate financial savings from solar generation. Returns money saved, CO2 offset, and trees equivalent.',
      inputSchema: z.object({
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
      execute: async (args) => {
        return httpClient.executeTool('calculate_financial_savings', {
          logger_id: args.logger_id,
          start_date: args.start_date,
          end_date: args.end_date,
          electricity_rate: args.electricity_rate,
        });
      },
    }),

    calculate_performance_ratio: tool({
      description:
        'Calculate the Performance Ratio (efficiency) for a system on a given date.',
      inputSchema: z.object({
        logger_id: z.string().describe('Logger/inverter serial number'),
        date: z.string().describe('Date in YYYY-MM-DD format'),
        capacity_kw: z
          .number()
          .optional()
          .describe(
            'Override system capacity in kW (optional, auto-inferred if not provided)',
          ),
      }),
      execute: async (args) => {
        return httpClient.executeTool('calculate_performance_ratio', {
          logger_id: args.logger_id,
          date: args.date,
          capacity_kw: args.capacity_kw,
        });
      },
    }),

    forecast_production: tool({
      description:
        'Forecast energy production for upcoming days using historical average.',
      inputSchema: z.object({
        logger_id: z.string().describe('Logger/inverter serial number'),
        days_ahead: z
          .number()
          .min(1)
          .max(7)
          .default(1)
          .describe('Number of days to forecast (1-7)'),
      }),
      execute: async (args) => {
        return httpClient.executeTool('forecast_production', {
          logger_id: args.logger_id,
          days_ahead: args.days_ahead,
        });
      },
    }),

    diagnose_error_codes: tool({
      description:
        'Diagnose system errors by scanning metadata for error codes. Returns human-readable descriptions and suggested fixes.',
      inputSchema: z.object({
        logger_id: z.string().describe('Logger/inverter serial number'),
        days: z
          .number()
          .min(1)
          .max(30)
          .default(7)
          .describe('Number of days to scan for errors (1-30)'),
      }),
      execute: async (args) => {
        return httpClient.executeTool('diagnose_error_codes', {
          logger_id: args.logger_id,
          days: args.days,
        });
      },
    }),

    get_fleet_overview: tool({
      description:
        'Get high-level status of the entire solar fleet (site-wide). Returns total current power, total daily energy, and active device counts.',
      inputSchema: z.object({}),
      execute: async () => {
        return httpClient.executeTool('get_fleet_overview', {});
      },
    }),

    health_check: tool({
      description: 'Check service health and database connectivity.',
      inputSchema: z.object({}),
      execute: async () => {
        return httpClient.executeTool('health_check', {});
      },
    }),
  };
}
