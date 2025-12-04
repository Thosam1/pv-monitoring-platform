import { Logger } from '@nestjs/common';
import { StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
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
  getDateDaysAgo,
  getLatestDateString,
  LoggerInfo,
} from './flow-utils';
import { UIResponseBuilder } from '../response';
import {
  NarrativeEngine,
  NarrativeContext,
  DEFAULT_NARRATIVE_PREFERENCES,
} from '../narrative';
import {
  argumentCheckNode,
  hasRequiredArgs,
} from '../nodes/argument-check.node';

const logger = new Logger('FinancialReportFlow');

/**
 * Default electricity rate in €/kWh (or $/kWh).
 * Can be overridden via flowContext.electricityRate for user-specific pricing.
 */
const DEFAULT_ELECTRICITY_RATE = 0.2;

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
 * 1. fetch_loggers: Fetch available loggers
 * 2. check_args: Validate required args, prompt if missing (with pre-fill from extraction)
 * 3. calculate_savings: Call calculate_financial_savings for past 30 days
 * 4. forecast: Call forecast_production for next 7 days
 * 5. render_report: Render FinancialReport component
 *
 * Supports proactive argument collection with context-aware prompts.
 * If router extracted a logger pattern (e.g., "the GoodWe"), it will be pre-selected.
 */
export function createFinancialReportFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Fetch available loggers
  const fetchLoggersNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    // TODO: DELETE - Debug logging
    logger.debug('[DEBUG FINANCIAL] === FLOW ENTRY (fetchLoggers) ===');
    logger.debug('[DEBUG FINANCIAL] Messages count:', state.messages.length);
    logger.debug(
      '[DEBUG FINANCIAL] FlowContext:',
      JSON.stringify(state.flowContext, null, 2),
    );
    logger.debug('[DEBUG FINANCIAL] FlowStep:', state.flowStep);

    logger.debug('Financial Report: Fetching available loggers');

    const result = await executeTool<LoggersResult>(
      httpClient,
      'list_loggers',
      {},
    );

    return {
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          loggers: result,
        },
      },
    };
  };

  // Step 2: Check and collect required arguments with proactive prompting
  const checkArgsNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Financial Report: Checking arguments');

    // Get available loggers for pattern resolution and selection
    const loggersResult = state.flowContext.toolResults?.loggers as
      | ToolResponse<LoggersResult>
      | undefined;
    const availableLoggers: LoggerInfo[] = loggersResult?.result?.loggers || [];

    // Use the reusable argument check node with model for persona-aware prompts
    return argumentCheckNode(state, availableLoggers, model);
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

    // FIX #4: Get rate from flow context (user-provided) or use default
    const electricityRate =
      state.flowContext.electricityRate ?? DEFAULT_ELECTRICITY_RATE;

    const result = await executeTool<FinancialResult>(
      httpClient,
      'calculate_financial_savings',
      {
        logger_id: loggerId,
        start_date: startDate,
        end_date: endDate,
        electricity_rate: electricityRate,
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

    // Check if we recovered to a different date range
    const needsRecoveryContext = state.flowContext.toolResults?.needsRecovery;
    const availableRange = state.flowContext.toolResults?.availableRange as
      | { start: string; end: string }
      | undefined;

    // Build props for FinancialReport component
    const savings = savingsResult?.result;
    const forecast = forecastResult?.result;

    // Build forecast line with fallback (GAP 2: Forecast fallback messaging)
    const forecastLine = forecast
      ? `Forecast: ${forecast.totalPredicted?.toFixed(1)} kWh over next 7 days.`
      : 'No forecast available for the selected logger.';

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

    // Detect zero/missing data scenario
    const isZeroReport =
      props.energyGenerated === 0 &&
      props.savings === 0 &&
      props.co2Offset === 0;

    // Build NarrativeContext for financial report
    const narrativeEngine = new NarrativeEngine(model);
    const preferences =
      state.flowContext.narrativePreferences || DEFAULT_NARRATIVE_PREFERENCES;

    const narrativeContext: NarrativeContext = {
      flowType: 'financial_report',
      subject: state.flowContext.selectedLoggerId || 'Unknown',
      data: {
        energyGenerated: props.energyGenerated,
        savings: props.savings,
        co2Offset: props.co2Offset,
        treesEquivalent: props.treesEquivalent,
        period: props.period,
        forecast: props.forecast,
        forecastLine,
        anomalies: [],
        healthScore: isZeroReport ? 0 : 100,
      },
      dataQuality:
        needsRecoveryContext && availableRange
          ? {
              completeness: isZeroReport ? 0 : 100,
              isExpectedWindow: false,
              actualWindow: availableRange,
            }
          : {
              completeness: isZeroReport ? 0 : 100,
              isExpectedWindow: true,
            },
      isFleetAnalysis: false,
    };

    // Generate narrative and suggestions using NarrativeEngine
    const narrativeResult = await narrativeEngine.generate(
      narrativeContext,
      preferences,
    );
    const suggestions = narrativeEngine.generateSuggestions(narrativeContext);

    logger.debug(
      `Financial report narrative generated via branch: ${narrativeResult.metadata.branchPath}`,
    );

    const narrative = narrativeResult.narrative;

    const renderArgs = UIResponseBuilder.financialReport(props, suggestions);

    const aiMessage = new AIMessage({
      content: narrative,
      tool_calls: [
        {
          id: toolCallId,
          name: 'render_ui_component',
          args: renderArgs,
        },
      ],
    });

    return {
      messages: [aiMessage],
      flowStep: 5,
      flowContext: {
        ...state.flowContext,
        lastNarrativeMetadata: {
          branchPath: narrativeResult.metadata.branchPath,
          wasRefined: narrativeResult.metadata.wasRefined,
          generationTimeMs: narrativeResult.metadata.generationTimeMs,
        },
      },
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'render_ui_component',
          args: renderArgs,
        },
      ],
    };
  };

  // Routing function: needs recovery?
  const needsRecovery = (state: ExplicitFlowState): 'recovery' | 'continue' => {
    return state.flowContext.toolResults?.needsRecovery
      ? 'recovery'
      : 'continue';
  };

  // Build the subgraph
  // Flow: fetch_loggers → check_args → [wait|proceed] → calculate_savings → forecast → render_report
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('fetch_loggers', fetchLoggersNode)
    .addNode('check_args', checkArgsNode)
    .addNode('calculate_savings', calculateSavingsNode)
    .addNode('forecast', forecastNode)
    .addNode('render_report', renderReportNode)
    .addEdge(START, 'fetch_loggers')
    .addEdge('fetch_loggers', 'check_args')
    .addConditionalEdges('check_args', hasRequiredArgs, {
      proceed: 'calculate_savings',
      wait: END, // Pause for user input - next turn will re-enter with selection
    })
    .addConditionalEdges('calculate_savings', needsRecovery, {
      recovery: END, // Trigger recovery subgraph
      continue: 'forecast',
    })
    .addEdge('forecast', 'render_report')
    .addEdge('render_report', END);

  return graph.compile();
}
