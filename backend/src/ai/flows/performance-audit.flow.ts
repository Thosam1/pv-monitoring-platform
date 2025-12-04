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
  createRenderArgs,
  computeBestPerformer,
  computeWorstPerformer,
  computeSpreadPercent,
  computeComparisonSeverity,
  formatLoggerOptions,
  LoggerInfo,
} from './flow-utils';
import {
  NarrativeEngine,
  NarrativeContext,
  DEFAULT_NARRATIVE_PREFERENCES,
  createDefaultDataQuality,
} from '../narrative';
import {
  argumentCheckNode,
  hasRequiredArgs,
} from '../nodes/argument-check.node';

const logger = new Logger('PerformanceAuditFlow');

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
 * Comparison response structure.
 */
interface ComparisonResult {
  data: Array<{
    timestamp: string;
    [loggerId: string]: number | string;
  }>;
  summary: {
    [loggerId: string]: {
      average: number;
      peak: number;
      total: number;
    };
  };
  metric: string;
  date: string;
}

/**
 * Performance Audit Flow
 *
 * Steps:
 * 1. fetch_loggers: Fetch all available loggers
 * 2. check_args: Validate required args (2+ loggers), prompt if missing with pre-fill
 * 3. compare: Call compare_loggers with selected IDs
 * 4. render_chart: Render ComparisonChart component
 *
 * Supports proactive argument collection with context-aware prompts.
 * If router extracted multiple loggers (e.g., "compare 925 and 926"), they will be pre-selected.
 */
export function createPerformanceAuditFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Fetch available loggers
  const fetchLoggersNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    // TODO: DELETE - Debug logging
    logger.debug('[DEBUG PERFORMANCE] === FLOW ENTRY (fetchLoggers) ===');
    logger.debug('[DEBUG PERFORMANCE] Messages count:', state.messages.length);
    logger.debug(
      '[DEBUG PERFORMANCE] FlowContext:',
      JSON.stringify(state.flowContext, null, 2),
    );
    logger.debug('[DEBUG PERFORMANCE] FlowStep:', state.flowStep);

    logger.debug('Performance Audit: Fetching available loggers');

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
    logger.debug('Performance Audit: Checking arguments');

    // Get available loggers for pattern resolution and selection
    const loggersResult = state.flowContext.toolResults?.loggers as
      | ToolResponse<LoggersResult>
      | undefined;
    const availableLoggers: LoggerInfo[] = loggersResult?.result?.loggers || [];

    // Use the reusable argument check node with model for persona-aware prompts
    return argumentCheckNode(state, availableLoggers, model);
  };

  // Step 3: Run comparison
  const compareNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    const loggerIds = state.flowContext.selectedLoggerIds;

    if (!loggerIds || loggerIds.length < 2) {
      logger.warn('Performance Audit: Not enough loggers selected');
      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            comparison: {
              status: 'error',
              message: 'Please select at least 2 loggers to compare',
            },
          },
        },
      };
    }

    logger.debug(`Performance Audit: Comparing ${loggerIds.join(', ')}`);

    const toolCallId = generateToolCallId();
    const result = await executeTool<ComparisonResult>(
      httpClient,
      'compare_loggers',
      {
        logger_ids: loggerIds,
        metric: 'power',
      },
    );

    // Check for recovery needed
    if (result.status === 'no_data_in_window' || result.status === 'no_data') {
      logger.debug('Performance Audit: No data, triggering recovery');
      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            comparison: result,
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
          comparison: result,
        },
      },
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'compare_loggers',
          args: { logger_ids: loggerIds, metric: 'power' },
        },
      ],
    };
  };

  // Step 4: Render comparison chart
  const renderChartNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Performance Audit: Rendering chart');

    const comparisonResult = state.flowContext.toolResults?.comparison as
      | ToolResponse<ComparisonResult>
      | undefined;

    const toolCallId = generateToolCallId();

    const comparison = comparisonResult?.result;
    const loggerIds = state.flowContext.selectedLoggerIds || [];

    // Build DynamicChart props for multi-line comparison
    const series = loggerIds.map((id, index) => ({
      dataKey: id,
      name: id,
      color: getSeriesColor(index),
      type: 'line' as const,
    }));

    const props = {
      chartType: 'line',
      title: `Power Comparison - ${comparison?.date || 'Latest'}`,
      xAxisKey: 'timestamp',
      series,
      data: comparison?.data || [],
      summaryStats: comparison?.summary,
    };

    // Compute comparison-specific metadata for narrative generation
    const summary = comparison?.summary || {};
    const bestPerformer = computeBestPerformer(summary);
    const worstPerformer = computeWorstPerformer(summary);

    // FIX #7: Handle edge case where comparison data is incomplete - offer retry selection
    if (!bestPerformer || !worstPerformer) {
      logger.warn(
        'Performance Audit: Unable to compute best/worst performers - empty or incomplete summary',
      );

      // Get available loggers for retry selection
      const loggersResult = state.flowContext.toolResults?.loggers as
        | ToolResponse<{ loggers: LoggerInfo[] }>
        | undefined;
      const availableLoggers = loggersResult?.result?.loggers || [];

      const retryToolCallId = generateToolCallId();

      // Create retry message with selection prompt
      const errorMessage = new AIMessage({
        content:
          "I couldn't compare those loggers due to missing or incomplete data for the selected time period. Would you like to try selecting different loggers?",
        tool_calls: [
          {
            id: retryToolCallId,
            name: 'request_user_selection',
            args: {
              prompt: 'Select different loggers to compare:',
              options: formatLoggerOptions({ loggers: availableLoggers }),
              selectionType: 'multiple',
              minCount: 2,
              maxCount: 5,
              contextMessage:
                'The previous selection had incomplete data. Please choose different loggers:',
            },
          },
        ],
      });

      return {
        messages: [errorMessage],
        flowStep: 0, // Reset to argument check
        flowContext: {
          ...state.flowContext,
          selectedLoggerIds: undefined, // Clear previous selection to prevent infinite loop
          waitingForUserInput: true,
          currentPromptArg: 'loggerIds',
        },
        pendingUiActions: [
          {
            toolCallId: retryToolCallId,
            toolName: 'request_user_selection',
            args: {
              prompt: 'Select different loggers to compare:',
              options: formatLoggerOptions({ loggers: availableLoggers }),
              selectionType: 'multiple',
              minCount: 2,
              maxCount: 5,
              contextMessage:
                'The previous selection had incomplete data. Please choose different loggers:',
            },
          },
        ],
      };
    }

    const spreadPercent = computeSpreadPercent(bestPerformer, worstPerformer);
    const comparisonSeverity = computeComparisonSeverity(spreadPercent);

    logger.debug(
      `Performance Audit: Best=${bestPerformer.loggerId}, Worst=${worstPerformer.loggerId}, Spread=${spreadPercent.toFixed(1)}%, Severity=${comparisonSeverity}`,
    );

    // Build NarrativeContext for performance audit
    const narrativeEngine = new NarrativeEngine(model);
    const preferences =
      state.flowContext.narrativePreferences || DEFAULT_NARRATIVE_PREFERENCES;

    const narrativeContext: NarrativeContext = {
      flowType: 'performance_audit',
      subject: loggerIds.join(', '),
      data: {
        comparison,
        loggerIds,
        summaryStats: comparison?.summary,
        // Add comparison-specific fields for branch selection and narrative generation
        bestPerformer,
        worstPerformer,
        spreadPercent,
        comparisonSeverity,
        anomalies: [],
        healthScore: 100, // Comparison doesn't have health score concept
      },
      dataQuality: createDefaultDataQuality(),
      isFleetAnalysis: true,
      fleetSize: loggerIds.length,
    };

    // Generate narrative and suggestions using NarrativeEngine
    const narrativeResult = await narrativeEngine.generate(
      narrativeContext,
      preferences,
    );
    const suggestions = narrativeEngine.generateSuggestions(narrativeContext);

    logger.debug(
      `Performance audit narrative generated via branch: ${narrativeResult.metadata.branchPath}`,
    );

    const narrative = narrativeResult.narrative;

    const aiMessage = new AIMessage({
      content: narrative,
      tool_calls: [
        {
          id: toolCallId,
          name: 'render_ui_component',
          args: createRenderArgs('ComparisonChart', props, suggestions),
        },
      ],
    });

    return {
      messages: [aiMessage],
      flowStep: 4,
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
          args: createRenderArgs('ComparisonChart', props, suggestions),
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
  // Flow: fetch_loggers → check_args → [wait|proceed] → compare → render_chart
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('fetch_loggers', fetchLoggersNode)
    .addNode('check_args', checkArgsNode)
    .addNode('compare', compareNode)
    .addNode('render_chart', renderChartNode)
    .addEdge(START, 'fetch_loggers')
    .addEdge('fetch_loggers', 'check_args')
    .addConditionalEdges('check_args', hasRequiredArgs, {
      proceed: 'compare', // Has 2+ loggers, continue to comparison
      wait: END, // Missing loggers, pause for user input
    })
    .addConditionalEdges('compare', needsRecovery, {
      recovery: END, // Trigger recovery subgraph
      continue: 'render_chart',
    })
    .addEdge('render_chart', END);

  return graph.compile();
}

/**
 * Get a color for a series based on index.
 */
function getSeriesColor(index: number): string {
  const colors = [
    '#FDB813', // Gold
    '#3B82F6', // Blue
    '#22C55E', // Green
    '#EF4444', // Red
    '#A855F7', // Purple
  ];
  return colors[index % colors.length];
}
