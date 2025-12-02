import { Logger } from '@nestjs/common';
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import {
  FlowContext,
  SuggestionItem,
  ToolResponse,
  isRecoverableError,
} from '../types/flow-state';
import { ToolsHttpClient } from '../tools-http.client';

const logger = new Logger('FlowUtils');

/**
 * Execute a tool and return the parsed result.
 */
export async function executeTool<T = unknown>(
  httpClient: ToolsHttpClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResponse<T>> {
  try {
    const result = await httpClient.executeTool(toolName, args);
    return result as ToolResponse<T>;
  } catch (error) {
    logger.error(`Tool ${toolName} failed: ${error}`);
    return {
      status: 'error',
      message: `Tool execution failed: ${error}`,
    };
  }
}

/**
 * Create a tool call message for the LLM.
 */
export function createToolCallMessage(
  toolCallId: string,
  toolName: string,
  args: unknown,
): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [
      {
        id: toolCallId,
        name: toolName,
        args: args as Record<string, unknown>,
      },
    ],
  });
}

/**
 * Create a tool result message.
 */
export function createToolResultMessage(
  toolCallId: string,
  toolName: string,
  result: unknown,
): ToolMessage {
  return new ToolMessage({
    content: JSON.stringify(result),
    tool_call_id: toolCallId,
    name: toolName,
  });
}

/**
 * Create render_ui_component arguments with suggestions.
 */
export function createRenderArgs(
  component: string,
  props: Record<string, unknown>,
  suggestions: SuggestionItem[] = [],
): Record<string, unknown> {
  return {
    component,
    props,
    suggestions,
  };
}

/**
 * Create request_user_selection arguments.
 */
export function createSelectionArgs(options: {
  prompt: string;
  options: Array<{
    value: string;
    label: string;
    group?: string;
    subtitle?: string;
  }>;
  selectionType?: 'single' | 'multiple';
  inputType?: 'dropdown' | 'date' | 'date-range';
  minDate?: string;
  maxDate?: string;
  flowHint?: {
    expectedNext: string;
    skipOption?: { label: string; action: string };
  };
}): Record<string, unknown> {
  return {
    prompt: options.prompt,
    options: options.options,
    selectionType: options.selectionType || 'single',
    inputType: options.inputType || 'dropdown',
    minDate: options.minDate,
    maxDate: options.maxDate,
    flowHint: options.flowHint,
  };
}

/**
 * Generate a unique tool call ID.
 */
export function generateToolCallId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/**
 * Check if the flow should trigger recovery based on tool response.
 */
export function shouldTriggerRecovery(response: ToolResponse): boolean {
  return isRecoverableError(response);
}

/**
 * Extract available date range from a no_data_in_window response.
 */
export function extractAvailableRange(
  response: ToolResponse,
): { start: string; end: string } | null {
  if (response.status === 'no_data_in_window' && response.availableRange) {
    return response.availableRange;
  }
  return null;
}

/**
 * Merge new context into existing flow context.
 */
export function mergeFlowContext(
  existing: FlowContext,
  updates: Partial<FlowContext>,
): FlowContext {
  return {
    ...existing,
    ...updates,
    toolResults: {
      ...existing.toolResults,
      ...updates.toolResults,
    },
  };
}

/**
 * Get the latest date string (YYYY-MM-DD) for today.
 */
export function getLatestDateString(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calculate a date N days ago.
 */
export function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Format logger options for selection from list_loggers response.
 */
export function formatLoggerOptions(loggersResult: {
  loggers?: Array<{
    loggerId: string;
    loggerType: string;
    dataRange?: { earliestData: string; latestData: string };
  }>;
}): Array<{ value: string; label: string; group: string; subtitle: string }> {
  const loggers = loggersResult?.loggers || [];

  return loggers.map((l) => ({
    value: l.loggerId,
    label: l.loggerId,
    group: l.loggerType,
    subtitle: l.dataRange
      ? `Data: ${l.dataRange.earliestData} to ${l.dataRange.latestData}`
      : 'No data range available',
  }));
}

/**
 * Extract the content of the last user message from the conversation.
 */
export function getLastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof HumanMessage || msg._getType() === 'human') {
      const content = msg.content;
      if (typeof content === 'string') {
        return content;
      }
      if (Array.isArray(content)) {
        return content
          .filter((c) => typeof c === 'string' || c.type === 'text')
          .map((c) =>
            typeof c === 'string' ? c : (c as { text: string }).text,
          )
          .join(' ');
      }
    }
  }
  return '';
}

/**
 * Pattern to detect "all devices" intent in user messages.
 */
export const ALL_DEVICES_PATTERN =
  /\ball\s+(devices?|loggers?|inverters?)\b|\bfleet\b|\bevery\s+(device|logger|inverter)\b|\beach\s+(device|logger|inverter)\b/i;

/**
 * Common suggestions for different flow outcomes.
 */
export const COMMON_SUGGESTIONS = {
  afterFleetOverview: (hasIssues: boolean): SuggestionItem[] =>
    hasIssues
      ? [
          {
            label: 'Diagnose issues',
            action: 'Run diagnostics on offline devices',
            priority: 'primary',
          },
          {
            label: 'Check health',
            action: 'Analyze health of the affected loggers',
            priority: 'secondary',
          },
        ]
      : [
          {
            label: 'Check efficiency',
            action: 'Calculate performance ratio for the fleet',
            priority: 'primary',
          },
          {
            label: 'Financial summary',
            action: 'Show financial savings for the past month',
            priority: 'secondary',
          },
        ],

  afterFinancialReport: (): SuggestionItem[] => [
    {
      label: 'Extend forecast',
      action: 'Forecast production for the next 30 days',
      priority: 'primary',
    },
    {
      label: 'Compare savings',
      action: 'Compare financial performance across all loggers',
      priority: 'secondary',
    },
  ],

  afterComparison: (): SuggestionItem[] => [
    {
      label: 'Compare energy',
      action: 'Compare total energy production instead of power',
      priority: 'primary',
    },
    {
      label: 'Health check',
      action: 'Check health for the lowest performer',
      priority: 'secondary',
    },
  ],

  afterHealthCheck: (hasAnomalies: boolean): SuggestionItem[] =>
    hasAnomalies
      ? [
          {
            label: 'Show power curve',
            action: 'Show power curve for the anomaly dates',
            priority: 'primary',
          },
          {
            label: 'Diagnose errors',
            action: 'Check error codes in metadata',
            priority: 'secondary',
          },
        ]
      : [
          {
            label: 'Check efficiency',
            action: 'Calculate performance ratio',
            priority: 'primary',
          },
          {
            label: 'Financial impact',
            action: 'Calculate financial savings',
            priority: 'secondary',
          },
        ],
};
