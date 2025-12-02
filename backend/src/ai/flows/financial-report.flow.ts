import { Logger } from '@nestjs/common';
import { StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { ToolsHttpClient } from '../tools-http.client';
import {
  ExplicitFlowState,
  ExplicitFlowStateAnnotation,
  ToolResponse,
} from '../types/flow-state';
import {
  executeTool,
  generateToolCallId,
  createRenderArgs,
  createSelectionArgs,
  formatLoggerOptions,
  getDateDaysAgo,
  getLatestDateString,
  COMMON_SUGGESTIONS,
} from './flow-utils';

const logger = new Logger('FinancialReportFlow');

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
 * Financial savings response structure.
 */
interface FinancialResult {
  energyGenerated: number;
  savings: number;
  co2Offset: number;
  treesEquivalent: number;
  period: { start: string; end: string };
}

/**
 * Forecast response structure.
 */
interface ForecastResult {
  forecasts: Array<{
    date: string;
    predictedEnergy: number;
  }>;
  totalPredicted: number;
}

/**
 * Financial Report Flow
 *
 * Steps:
 * 1. check_context: Check if logger is already selected
 * 2. select_logger (conditional): If no logger, prompt selection
 * 3. calculate_savings: Call calculate_financial_savings for past 30 days
 * 4. forecast: Call forecast_production for next 7 days
 * 5. render_report: Render FinancialReport component
 */
export function createFinancialReportFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Check if logger context exists
  const checkContextNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Financial Report: Checking context');

    // If we have a logger ID from routing extraction, we can proceed
    if (state.flowContext.selectedLoggerId) {
      logger.debug(
        `Logger already selected: ${state.flowContext.selectedLoggerId}`,
      );
      return { flowStep: 1 };
    }

    // Need to fetch loggers for selection
    logger.debug('No logger selected, fetching list');
    const result = await executeTool<LoggersResult>(
      httpClient,
      'list_loggers',
      {},
    );

    return {
      flowStep: 1,
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          loggers: result,
        },
      },
    };
  };

  // Step 2 (conditional): Prompt logger selection
  const selectLoggerNode = (
    state: ExplicitFlowState,
  ): Partial<ExplicitFlowState> => {
    logger.debug('Financial Report: Prompting logger selection');

    const loggersResult = state.flowContext.toolResults?.loggers as
      | ToolResponse<LoggersResult>
      | undefined;
    const options = formatLoggerOptions(
      loggersResult?.result || { loggers: [] },
    );

    const toolCallId = generateToolCallId();

    // Create selection message
    const aiMessage = new AIMessage({
      content:
        "I'll help you create a financial report. First, please select which logger you'd like to analyze:",
      tool_calls: [
        {
          id: toolCallId,
          name: 'request_user_selection',
          args: createSelectionArgs({
            prompt: 'Select a logger for financial analysis:',
            options,
            selectionType: 'single',
            inputType: 'dropdown',
            flowHint: {
              expectedNext:
                'Will calculate financial savings for the past 30 days',
            },
          }),
        },
      ],
    });

    return {
      messages: [aiMessage],
      flowStep: 2,
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'request_user_selection',
          args: createSelectionArgs({
            prompt: 'Select a logger for financial analysis:',
            options,
            selectionType: 'single',
            inputType: 'dropdown',
          }),
        },
      ],
    };
  };

  // Step 3: Calculate financial savings
  const calculateSavingsNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    const loggerId = state.flowContext.selectedLoggerId;

    if (!loggerId) {
      logger.warn('Financial Report: No logger ID available');
      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            savings: { status: 'error', message: 'No logger selected' },
          },
        },
      };
    }

    logger.debug(`Financial Report: Calculating savings for ${loggerId}`);

    const toolCallId = generateToolCallId();
    const startDate = getDateDaysAgo(30);
    const endDate = getLatestDateString();

    const result = await executeTool<FinancialResult>(
      httpClient,
      'calculate_financial_savings',
      {
        logger_id: loggerId,
        start_date: startDate,
        end_date: endDate,
        electricity_rate: 0.2,
      },
    );

    // Check for recovery needed
    if (result.status === 'no_data_in_window' || result.status === 'no_data') {
      logger.debug('Financial Report: No data, triggering recovery');
      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            savings: result,
            needsRecovery: true,
            availableRange: result.availableRange,
          },
        },
      };
    }

    return {
      flowStep: 3,
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          savings: result,
        },
      },
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'calculate_financial_savings',
          args: {
            logger_id: loggerId,
            start_date: startDate,
            end_date: endDate,
          },
        },
      ],
    };
  };

  // Step 4: Forecast production
  const forecastNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    const loggerId = state.flowContext.selectedLoggerId;

    if (!loggerId) {
      return { flowStep: 4 };
    }

    logger.debug(`Financial Report: Forecasting for ${loggerId}`);

    const toolCallId = generateToolCallId();
    const result = await executeTool<ForecastResult>(
      httpClient,
      'forecast_production',
      {
        logger_id: loggerId,
        days_ahead: 7,
      },
    );

    return {
      flowStep: 4,
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          forecast: result,
        },
      },
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'forecast_production',
          args: { logger_id: loggerId, days_ahead: 7 },
        },
      ],
    };
  };

  // Step 5: Render financial report
  const renderReportNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Financial Report: Rendering report');

    const savingsResult = state.flowContext.toolResults?.savings as
      | ToolResponse<FinancialResult>
      | undefined;
    const forecastResult = state.flowContext.toolResults?.forecast as
      | ToolResponse<ForecastResult>
      | undefined;

    const toolCallId = generateToolCallId();

    // Build props for FinancialReport component
    const savings = savingsResult?.result;
    const forecast = forecastResult?.result;

    const props = {
      energyGenerated: savings?.energyGenerated || 0,
      savings: savings?.savings || 0,
      co2Offset: savings?.co2Offset || 0,
      treesEquivalent: savings?.treesEquivalent || 0,
      period: savings?.period || { start: '', end: '' },
      forecast: forecast
        ? {
            totalPredicted: forecast.totalPredicted,
            days: forecast.forecasts,
          }
        : undefined,
    };

    const suggestions = COMMON_SUGGESTIONS.afterFinancialReport();

    // Generate LLM narrative
    const narrativePrompt = `Generate a brief (2-3 sentences) financial summary narrative.
      Energy generated: ${props.energyGenerated} kWh
      Savings: $${props.savings?.toFixed(2)}
      CO2 offset: ${props.co2Offset?.toFixed(1)} kg
      ${forecast ? `Forecast: ${forecast.totalPredicted?.toFixed(1)} kWh over next 7 days` : ''}
      Be concise and highlight the key financial impact.`;

    let narrative = '';
    try {
      const response = await model.invoke([new HumanMessage(narrativePrompt)]);
      narrative =
        typeof response.content === 'string'
          ? response.content
          : 'Financial report generated successfully.';
    } catch (error) {
      logger.warn(`Failed to generate narrative: ${error}`);
      narrative = `Your solar system generated ${props.energyGenerated?.toFixed(1)} kWh, saving $${props.savings?.toFixed(2)} and offsetting ${props.co2Offset?.toFixed(1)} kg of CO2.`;
    }

    const aiMessage = new AIMessage({
      content: narrative,
      tool_calls: [
        {
          id: toolCallId,
          name: 'render_ui_component',
          args: createRenderArgs('FinancialReport', props, suggestions),
        },
      ],
    });

    return {
      messages: [aiMessage],
      flowStep: 5,
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'render_ui_component',
          args: createRenderArgs('FinancialReport', props, suggestions),
        },
      ],
    };
  };

  // Routing function: has logger selected?
  const hasLogger = (state: ExplicitFlowState): 'proceed' | 'select' => {
    return state.flowContext.selectedLoggerId ? 'proceed' : 'select';
  };

  // Routing function: needs recovery?
  const needsRecovery = (state: ExplicitFlowState): 'recovery' | 'continue' => {
    return state.flowContext.toolResults?.needsRecovery
      ? 'recovery'
      : 'continue';
  };

  // Build the subgraph
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('check_context', checkContextNode)
    .addNode('select_logger', selectLoggerNode)
    .addNode('calculate_savings', calculateSavingsNode)
    .addNode('forecast', forecastNode)
    .addNode('render_report', renderReportNode)
    .addEdge(START, 'check_context')
    .addConditionalEdges('check_context', hasLogger, {
      proceed: 'calculate_savings',
      select: 'select_logger',
    })
    .addEdge('select_logger', END) // Pause for user input - next turn will re-enter with selection
    .addConditionalEdges('calculate_savings', needsRecovery, {
      recovery: END, // Trigger recovery subgraph
      continue: 'forecast',
    })
    .addEdge('forecast', 'render_report')
    .addEdge('render_report', END);

  return graph.compile();
}
