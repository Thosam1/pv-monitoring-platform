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
  getLastUserMessage,
  ALL_DEVICES_PATTERN,
} from './flow-utils';
import {
  NarrativeEngine,
  NarrativeContext,
  DEFAULT_NARRATIVE_PREFERENCES,
  createDefaultDataQuality,
} from '../narrative';

const logger = new Logger('HealthCheckFlow');

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
 * Health analysis response structure.
 */
interface HealthResult {
  anomalies: Array<{
    timestamp: string;
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
    metrics: {
      power: number;
      irradiance: number;
    };
  }>;
  summary: {
    totalAnomalies: number;
    healthScore: number;
    period: string;
  };
  status: string;
}

/**
 * Health Check Flow
 *
 * Steps:
 * 1. check_context: Check if logger is already selected
 * 2. select_logger (conditional): If no logger, prompt selection
 * 3. analyze_health: Call analyze_inverter_health for 7 days
 * 4. render_report: Render HealthReport component with anomaly table
 */
export function createHealthCheckFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Check if logger context exists
  const checkContextNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Health Check: Checking context');

    // If we have a logger ID from routing extraction, we can proceed
    if (state.flowContext.selectedLoggerId) {
      logger.debug(
        `Logger already selected: ${state.flowContext.selectedLoggerId}`,
      );
      return { flowStep: 1 };
    }

    // Check for "all devices" intent in the user message
    const lastUserMessage = getLastUserMessage(state.messages);
    const wantsAllDevices = ALL_DEVICES_PATTERN.test(lastUserMessage);

    // Need to fetch loggers (for either selection or all-devices analysis)
    logger.debug(
      wantsAllDevices
        ? 'All devices requested, fetching list for bulk analysis'
        : 'No logger selected, fetching list for selection',
    );
    const result = await executeTool<LoggersResult>(
      httpClient,
      'list_loggers',
      {},
    );

    return {
      flowStep: 1,
      flowContext: {
        ...state.flowContext,
        analyzeAllLoggers: wantsAllDevices,
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
    logger.debug('Health Check: Prompting logger selection');

    const loggersResult = state.flowContext.toolResults?.loggers as
      | ToolResponse<LoggersResult>
      | undefined;
    const options = formatLoggerOptions(
      loggersResult?.result || { loggers: [] },
    );

    const toolCallId = generateToolCallId();

    const aiMessage = new AIMessage({
      content:
        "I'll analyze the health of your inverter and check for anomalies. Which logger would you like me to check?",
      tool_calls: [
        {
          id: toolCallId,
          name: 'request_user_selection',
          args: createSelectionArgs({
            prompt: 'Select a logger for health analysis:',
            options,
            selectionType: 'single',
            inputType: 'dropdown',
            flowHint: {
              expectedNext: 'Will analyze for anomalies over the past 7 days',
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
            prompt: 'Select a logger for health analysis:',
            options,
            selectionType: 'single',
            inputType: 'dropdown',
          }),
        },
      ],
    };
  };

  // Step 3: Analyze health (single logger or all loggers)
  const analyzeHealthNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    const analyzeAllLoggers = state.flowContext.analyzeAllLoggers;
    const loggerId = state.flowContext.selectedLoggerId;

    // Handle "all devices" case
    if (analyzeAllLoggers) {
      const loggersResult = state.flowContext.toolResults?.loggers as
        | ToolResponse<LoggersResult>
        | undefined;
      const loggers = loggersResult?.result?.loggers || [];

      if (loggers.length === 0) {
        logger.warn('Health Check: No loggers found for all-devices analysis');
        return {
          flowStep: 3,
          flowContext: {
            ...state.flowContext,
            toolResults: {
              ...state.flowContext.toolResults,
              health: { status: 'error', message: 'No loggers found' },
              allLoggersHealth: [],
            },
          },
        };
      }

      logger.debug(
        `Health Check: Analyzing health for all ${loggers.length} loggers`,
      );

      // Analyze each logger and collect results
      const allResults: Array<{
        loggerId: string;
        loggerType: string;
        health: ToolResponse<HealthResult>;
      }> = [];

      for (const loggerInfo of loggers) {
        const result = await executeTool<HealthResult>(
          httpClient,
          'analyze_inverter_health',
          {
            logger_id: loggerInfo.loggerId,
            days: 7,
          },
        );

        allResults.push({
          loggerId: loggerInfo.loggerId,
          loggerType: loggerInfo.loggerType,
          health: result,
        });
      }

      const toolCallId = generateToolCallId();

      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            allLoggersHealth: allResults,
          },
        },
        pendingUiActions: [
          {
            toolCallId,
            toolName: 'analyze_inverter_health',
            args: { all_loggers: true, count: loggers.length, days: 7 },
          },
        ],
      };
    }

    // Single logger case
    if (!loggerId) {
      logger.warn('Health Check: No logger ID available');
      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            health: { status: 'error', message: 'No logger selected' },
          },
        },
      };
    }

    logger.debug(`Health Check: Analyzing health for ${loggerId}`);

    const toolCallId = generateToolCallId();
    const result = await executeTool<HealthResult>(
      httpClient,
      'analyze_inverter_health',
      {
        logger_id: loggerId,
        days: 7,
      },
    );

    // Check for recovery needed
    if (result.status === 'no_data_in_window' || result.status === 'no_data') {
      logger.debug('Health Check: No data, triggering recovery');
      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            health: result,
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
          health: result,
        },
      },
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'analyze_inverter_health',
          args: { logger_id: loggerId, days: 7 },
        },
      ],
    };
  };

  // Step 4: Render health report (single logger or all loggers summary)
  const renderReportNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Health Check: Rendering report');

    const toolCallId = generateToolCallId();
    const narrativeEngine = new NarrativeEngine(model);
    const preferences =
      state.flowContext.narrativePreferences || DEFAULT_NARRATIVE_PREFERENCES;

    // Handle "all devices" case
    if (state.flowContext.analyzeAllLoggers) {
      const allLoggersHealth = state.flowContext.toolResults
        ?.allLoggersHealth as
        | Array<{
            loggerId: string;
            loggerType: string;
            health: ToolResponse<HealthResult>;
          }>
        | undefined;

      if (!allLoggersHealth || allLoggersHealth.length === 0) {
        const aiMessage = new AIMessage({
          content: 'No health data available for any loggers.',
        });
        return { messages: [aiMessage], flowStep: 4 };
      }

      // Aggregate results for fleet summary
      const fleetSummary = allLoggersHealth.map((item) => {
        const health = item.health.result;
        const anomalyCount = health?.anomalies?.length || 0;
        const score = health?.summary?.healthScore ?? 100;
        return {
          loggerId: item.loggerId,
          loggerType: item.loggerType,
          healthScore: score,
          anomalyCount,
          status: health?.status || 'unknown',
        };
      });

      const totalAnomalies = fleetSummary.reduce(
        (sum, l) => sum + l.anomalyCount,
        0,
      );
      const avgHealthScore =
        fleetSummary.reduce((sum, l) => sum + l.healthScore, 0) /
        fleetSummary.length;
      const loggersWithIssues = fleetSummary.filter(
        (l) => l.anomalyCount > 0,
      ).length;

      // Collect all anomalies from fleet for NarrativeContext
      const allAnomalies = allLoggersHealth.flatMap(
        (item) =>
          item.health.result?.anomalies?.map((a) => ({
            timestamp: a.timestamp,
            type: a.type,
            description: a.description,
            severity: a.severity,
            metrics: a.metrics,
          })) || [],
      );

      // Build props for FleetHealthReport component
      const props = {
        period: 'Last 7 days',
        totalLoggers: fleetSummary.length,
        avgHealthScore: Math.round(avgHealthScore),
        totalAnomalies,
        loggersWithIssues,
        loggers: fleetSummary,
      };

      // Build NarrativeContext for fleet analysis
      const narrativeContext: NarrativeContext = {
        flowType: 'health_check',
        subject: 'fleet',
        data: {
          anomalies: allAnomalies,
          healthScore: Math.round(avgHealthScore),
          period: 'Last 7 days',
          loggersWithIssues,
          totalLoggers: fleetSummary.length,
        },
        dataQuality: createDefaultDataQuality(),
        isFleetAnalysis: true,
        fleetSize: fleetSummary.length,
      };

      // Generate narrative using NarrativeEngine
      const narrativeResult = await narrativeEngine.generate(
        narrativeContext,
        preferences,
      );
      const suggestions = narrativeEngine.generateSuggestions(narrativeContext);

      logger.debug(
        `Fleet narrative generated via branch: ${narrativeResult.metadata.branchPath}`,
      );

      const aiMessage = new AIMessage({
        content: narrativeResult.narrative,
        tool_calls: [
          {
            id: toolCallId,
            name: 'render_ui_component',
            args: createRenderArgs('FleetHealthReport', props, suggestions),
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
            args: createRenderArgs('FleetHealthReport', props, suggestions),
          },
        ],
      };
    }

    // Single logger case
    const healthResult = state.flowContext.toolResults?.health as
      | ToolResponse<HealthResult>
      | undefined;
    const loggerId = state.flowContext.selectedLoggerId || 'Unknown';

    const health = healthResult?.result;
    const anomalies = health?.anomalies || [];

    // Build props for HealthReport component
    const props = {
      loggerId,
      period: health?.summary?.period || 'Last 7 days',
      healthScore: health?.summary?.healthScore ?? 100,
      anomalies: anomalies.map((a) => ({
        timestamp: a.timestamp,
        type: a.type,
        description: a.description,
        severity: a.severity,
        power: a.metrics.power,
        irradiance: a.metrics.irradiance,
      })),
    };

    // Build NarrativeContext for single logger analysis
    const narrativeContext: NarrativeContext = {
      flowType: 'health_check',
      subject: loggerId,
      data: {
        anomalies: anomalies.map((a) => ({
          timestamp: a.timestamp,
          type: a.type,
          description: a.description,
          severity: a.severity,
          metrics: a.metrics,
        })),
        healthScore: props.healthScore,
        period: props.period,
      },
      dataQuality: state.flowContext.toolResults?.needsRecovery
        ? {
            completeness: 0,
            isExpectedWindow: false,
            actualWindow: state.flowContext.toolResults?.availableRange as
              | { start: string; end: string }
              | undefined,
          }
        : createDefaultDataQuality(),
      isFleetAnalysis: false,
    };

    // Generate narrative using NarrativeEngine
    const narrativeResult = await narrativeEngine.generate(
      narrativeContext,
      preferences,
    );
    const suggestions = narrativeEngine.generateSuggestions(narrativeContext);

    logger.debug(
      `Single logger narrative generated via branch: ${narrativeResult.metadata.branchPath}`,
    );

    const aiMessage = new AIMessage({
      content: narrativeResult.narrative,
      tool_calls: [
        {
          id: toolCallId,
          name: 'render_ui_component',
          args: createRenderArgs('HealthReport', props, suggestions),
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
          args: createRenderArgs('HealthReport', props, suggestions),
        },
      ],
    };
  };

  // Routing function: has logger selected or wants all devices?
  const hasLogger = (state: ExplicitFlowState): 'proceed' | 'select' => {
    // If user wants all devices, skip selection
    if (state.flowContext.analyzeAllLoggers) {
      return 'proceed';
    }
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
    .addNode('analyze_health', analyzeHealthNode)
    .addNode('render_report', renderReportNode)
    .addEdge(START, 'check_context')
    .addConditionalEdges('check_context', hasLogger, {
      proceed: 'analyze_health',
      select: 'select_logger',
    })
    .addEdge('select_logger', END) // Pause for user input - next turn will re-enter with selection
    .addConditionalEdges('analyze_health', needsRecovery, {
      recovery: END, // Trigger recovery subgraph
      continue: 'render_report',
    })
    .addEdge('render_report', END);

  return graph.compile();
}
