import { Logger } from '@nestjs/common';
import { StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { ToolsHttpClient } from '../tools-http.client';
import {
  ExplicitFlowState,
  ExplicitFlowStateAnnotation,
  ToolResponse,
} from '../types/flow-state';
import {
  generateToolCallId,
  createSelectionArgs,
  formatLoggerOptions,
  executeTool,
} from '../flows/flow-utils';

const logger = new Logger('RecoverySubgraph');

/**
 * Recovery type enumeration.
 */
type RecoveryType = 'no_data_in_window' | 'no_data' | 'error' | 'none';

/**
 * Logger list response structure.
 */
interface LoggersResult {
  loggers: Array<{
    loggerId: string;
    loggerType: string;
    dataRange?: { earliestData: string; latestData: string };
  }>;
}

/**
 * Recovery Subgraph
 *
 * Handles data availability errors globally across all flows.
 *
 * Triggers:
 * - no_data_in_window: Data exists but not in requested date range
 * - no_data: Logger has no data at all
 * - error: Tool execution failed
 *
 * Steps:
 * 1. detect_recovery_type: Analyze tool results to determine recovery type
 * 2. prompt_date_selection (for no_data_in_window): Show date picker with available range
 * 3. suggest_alternatives (for no_data): List other loggers or suggest upload
 * 4. explain_error (for error): Provide user-friendly error message
 */
export function createRecoverySubgraph(httpClient: ToolsHttpClient) {
  // Step 1: Detect recovery type
  const detectRecoveryTypeNode = (
    state: ExplicitFlowState,
  ): Partial<ExplicitFlowState> => {
    logger.debug('Recovery: Detecting recovery type');

    // Check tool results for error status
    const toolResults = state.flowContext.toolResults || {};
    let recoveryType: RecoveryType = 'none';
    let errorDetails: {
      message?: string;
      availableRange?: { start: string; end: string };
    } = {};

    // Scan tool results for recoverable errors
    for (const [toolName, result] of Object.entries(toolResults)) {
      const toolResponse = result as ToolResponse;

      if (toolResponse?.status === 'no_data_in_window') {
        recoveryType = 'no_data_in_window';
        errorDetails = {
          message:
            toolResponse.message ||
            `No data available in the requested date range`,
          availableRange: toolResponse.availableRange,
        };
        logger.debug(`Recovery type: no_data_in_window for ${toolName}`);
        break;
      }

      if (toolResponse?.status === 'no_data') {
        recoveryType = 'no_data';
        errorDetails = {
          message: toolResponse.message || `Logger has no data available`,
        };
        logger.debug(`Recovery type: no_data for ${toolName}`);
        break;
      }

      if (toolResponse?.status === 'error') {
        recoveryType = 'error';
        errorDetails = {
          message: toolResponse.message || `Tool execution failed`,
        };
        logger.debug(`Recovery type: error for ${toolName}`);
        break;
      }
    }

    return {
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          recoveryType,
          errorDetails,
        },
      },
      // Increment recovery attempts
      recoveryAttempts: (state.recoveryAttempts || 0) + 1,
    };
  };

  // Step 2: Prompt date selection for no_data_in_window
  const promptDateSelectionNode = (
    state: ExplicitFlowState,
  ): Partial<ExplicitFlowState> => {
    logger.debug('Recovery: Prompting date selection');

    const errorDetails = state.flowContext.toolResults?.errorDetails as {
      message?: string;
      availableRange?: { start: string; end: string };
    };
    const availableRange = errorDetails?.availableRange;

    if (!availableRange) {
      logger.warn('Recovery: No available range provided');
      return {
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            recoveryType: 'error',
          },
        },
      };
    }

    const toolCallId = generateToolCallId();

    const aiMessage = new AIMessage({
      content: `The requested date doesn't have data available. Data is available from ${availableRange.start} to ${availableRange.end}. Please select a date within this range:`,
      tool_calls: [
        {
          id: toolCallId,
          name: 'request_user_selection',
          args: createSelectionArgs({
            prompt: 'Select a date with available data:',
            options: [], // Not needed for date picker
            selectionType: 'single',
            inputType: 'date',
            minDate: availableRange.start,
            maxDate: availableRange.end,
            flowHint: {
              expectedNext: 'Will retry the analysis with your selected date',
              skipOption: {
                label: 'Use latest available',
                action: `Use ${availableRange.end}`,
              },
            },
          }),
        },
      ],
    });

    return {
      messages: [aiMessage],
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'request_user_selection',
          args: createSelectionArgs({
            prompt: 'Select a date with available data:',
            options: [],
            selectionType: 'single',
            inputType: 'date',
            minDate: availableRange.start,
            maxDate: availableRange.end,
          }),
        },
      ],
    };
  };

  // Step 3: Suggest alternatives for no_data
  const suggestAlternativesNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Recovery: Suggesting alternatives');

    const errorDetails = state.flowContext.toolResults?.errorDetails as {
      message?: string;
    };

    // Fetch available loggers to suggest alternatives
    const loggersResult = await executeTool<LoggersResult>(
      httpClient,
      'list_loggers',
      {},
    );

    const options = formatLoggerOptions(
      loggersResult?.result || { loggers: [] },
    );
    const toolCallId = generateToolCallId();

    // Filter out the problematic logger if we know which one it was
    const currentLoggerId = state.flowContext.selectedLoggerId;
    const alternativeOptions = currentLoggerId
      ? options.filter((o) => o.value !== currentLoggerId)
      : options;

    if (alternativeOptions.length > 0) {
      const aiMessage = new AIMessage({
        content: `${errorDetails?.message || 'This logger has no data available'}. Would you like to try a different logger?`,
        tool_calls: [
          {
            id: toolCallId,
            name: 'request_user_selection',
            args: createSelectionArgs({
              prompt: 'Select a different logger:',
              options: alternativeOptions,
              selectionType: 'single',
              inputType: 'dropdown',
              flowHint: {
                expectedNext: 'Will analyze the selected logger instead',
              },
            }),
          },
        ],
      });

      return {
        messages: [aiMessage],
        pendingUiActions: [
          {
            toolCallId,
            toolName: 'request_user_selection',
            args: createSelectionArgs({
              prompt: 'Select a different logger:',
              options: alternativeOptions,
              selectionType: 'single',
              inputType: 'dropdown',
            }),
          },
        ],
      };
    }

    // No alternative loggers available
    const aiMessage = new AIMessage({
      content: `${errorDetails?.message || 'No data is available for this logger'}. Please upload data files first using the Data Upload page, then try again.`,
      tool_calls: [],
    });

    return {
      messages: [aiMessage],
    };
  };

  // Step 4: Explain error
  const explainErrorNode = (
    state: ExplicitFlowState,
  ): Partial<ExplicitFlowState> => {
    logger.debug('Recovery: Explaining error');

    const errorDetails = state.flowContext.toolResults?.errorDetails as {
      message?: string;
    };

    const aiMessage = new AIMessage({
      content: `I encountered an issue: ${errorDetails?.message || 'An unexpected error occurred'}. Please try again or select a different option.`,
      tool_calls: [],
    });

    return {
      messages: [aiMessage],
    };
  };

  // Routing function: which recovery path?
  const routeRecovery = (
    state: ExplicitFlowState,
  ): 'date_selection' | 'alternatives' | 'explain_error' | 'end' => {
    const recoveryType = state.flowContext.toolResults
      ?.recoveryType as RecoveryType;
    const attempts = state.recoveryAttempts || 0;

    // Prevent infinite recovery loops
    if (attempts > 3) {
      logger.warn('Recovery: Max attempts reached, ending');
      return 'explain_error';
    }

    switch (recoveryType) {
      case 'no_data_in_window':
        return 'date_selection';
      case 'no_data':
        return 'alternatives';
      case 'error':
        return 'explain_error';
      default:
        return 'end';
    }
  };

  // Build the subgraph
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('detect_recovery_type', detectRecoveryTypeNode)
    .addNode('prompt_date_selection', promptDateSelectionNode)
    .addNode('suggest_alternatives', suggestAlternativesNode)
    .addNode('explain_error', explainErrorNode)
    .addEdge(START, 'detect_recovery_type')
    .addConditionalEdges('detect_recovery_type', routeRecovery, {
      date_selection: 'prompt_date_selection',
      alternatives: 'suggest_alternatives',
      explain_error: 'explain_error',
      end: END,
    })
    .addEdge('prompt_date_selection', END)
    .addEdge('suggest_alternatives', END)
    .addEdge('explain_error', END);

  return graph.compile();
}
