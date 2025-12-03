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
  createSelectionArgs,
  formatLoggerOptions,
  computeBestPerformer,
  computeWorstPerformer,
  computeSpreadPercent,
  computeComparisonSeverity,
} from './flow-utils';
import {
  NarrativeEngine,
  NarrativeContext,
  DEFAULT_NARRATIVE_PREFERENCES,
  createDefaultDataQuality,
} from '../narrative';

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
 * 1. discover_loggers: Fetch all available loggers
 * 2. select_loggers: Prompt multi-select (2-5 loggers)
 * 3. compare: Call compare_loggers with selected IDs
 * 4. render_chart: Render ComparisonChart component
 */
export function createPerformanceAuditFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Discover available loggers
  const discoverLoggersNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Performance Audit: Discovering loggers');

    const toolCallId = generateToolCallId();
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
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'list_loggers',
          args: {},
        },
      ],
    };
  };

  // Step 2: Prompt multi-logger selection
  const selectLoggersNode = (
    state: ExplicitFlowState,
  ): Partial<ExplicitFlowState> => {
    logger.debug('Performance Audit: Prompting logger selection');

    const loggersResult = state.flowContext.toolResults?.loggers as
      | ToolResponse<LoggersResult>
      | undefined;
    const options = formatLoggerOptions(
      loggersResult?.result || { loggers: [] },
    );

    // Check if we already have loggers selected
    if (
      state.flowContext.selectedLoggerIds &&
      state.flowContext.selectedLoggerIds.length >= 2
    ) {
      logger.debug('Loggers already selected, skipping selection');
      return { flowStep: 2 };
    }

    const toolCallId = generateToolCallId();

    const aiMessage = new AIMessage({
      content:
        "Let's compare performance across your loggers. Please select 2-5 loggers to compare:",
      tool_calls: [
        {
          id: toolCallId,
          name: 'request_user_selection',
          args: createSelectionArgs({
            prompt: 'Select loggers to compare (2-5):',
            options,
            selectionType: 'multiple',
            inputType: 'dropdown',
            flowHint: {
              expectedNext: 'Will compare power output across selected loggers',
              skipOption: {
                label: 'Compare top 3',
                action: 'Automatically select the 3 loggers with most data',
              },
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
            prompt: 'Select loggers to compare (2-5):',
            options,
            selectionType: 'multiple',
            inputType: 'dropdown',
          }),
        },
      ],
    };
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
    const spreadPercent = computeSpreadPercent(bestPerformer, worstPerformer);
    const comparisonSeverity = computeComparisonSeverity(spreadPercent);

    logger.debug(
      `Performance Audit: Best=${bestPerformer?.loggerId}, Worst=${worstPerformer?.loggerId}, Spread=${spreadPercent.toFixed(1)}%, Severity=${comparisonSeverity}`,
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

  // Routing function: has logger selection? (for conditional continue/pause)
  const hasLoggerSelection = (state: ExplicitFlowState): 'proceed' | 'wait' => {
    const selectedCount = state.flowContext.selectedLoggerIds?.length ?? 0;
    return selectedCount >= 2 ? 'proceed' : 'wait';
  };

  // Routing function: needs recovery?
  const needsRecovery = (state: ExplicitFlowState): 'recovery' | 'continue' => {
    return state.flowContext.toolResults?.needsRecovery
      ? 'recovery'
      : 'continue';
  };

  // Build the subgraph
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('discover_loggers', discoverLoggersNode)
    .addNode('select_loggers', selectLoggersNode)
    .addNode('compare', compareNode)
    .addNode('render_chart', renderChartNode)
    .addEdge(START, 'discover_loggers')
    .addEdge('discover_loggers', 'select_loggers')
    .addConditionalEdges('select_loggers', hasLoggerSelection, {
      proceed: 'compare', // Has selection, continue to comparison
      wait: END, // No selection, pause for user input
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
