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
  getLastUserMessage,
  ALL_DEVICES_PATTERN,
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
 * 1. fetch_loggers: Fetch available loggers
 * 2. check_args: Validate required args, prompt if missing (with pre-fill from extraction)
 * 3. analyze_health: Call analyze_inverter_health for 7 days
 * 4. render_report: Render HealthReport component with anomaly table
 *
 * Supports proactive argument collection with context-aware prompts.
 * If router extracted a logger pattern (e.g., "the GoodWe"), it will be pre-selected.
 */
export function createHealthCheckFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Fetch available loggers (always needed for selection or analysis)
  const fetchLoggersNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    // TODO: DELETE - Debug logging
    logger.debug('[DEBUG HEALTH_CHECK] === FLOW ENTRY (fetchLoggers) ===');
    logger.debug('[DEBUG HEALTH_CHECK] Messages count:', state.messages.length);
    logger.debug(
      '[DEBUG HEALTH_CHECK] FlowContext:',
      JSON.stringify(state.flowContext, null, 2),
    );
    logger.debug('[DEBUG HEALTH_CHECK] FlowStep:', state.flowStep);

    logger.debug('Health Check: Fetching available loggers');

    // Check for "all devices" intent in the user message
    const lastUserMessage = getLastUserMessage(state.messages);
    const wantsAllDevices = ALL_DEVICES_PATTERN.test(lastUserMessage);

    const result = await executeTool<LoggersResult>(
      httpClient,
      'list_loggers',
      {},
    );

    return {
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

  // Step 2: Check and collect required arguments with proactive prompting
  const checkArgsNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Health Check: Checking arguments');

    // Skip argument check if user wants all devices
    if (state.flowContext.analyzeAllLoggers) {
      logger.debug('All devices requested, skipping argument check');
      return { flowStep: 1 };
    }

    // Get available loggers for pattern resolution and selection
    const loggersResult = state.flowContext.toolResults?.loggers as
      | ToolResponse<LoggersResult>
      | undefined;
    const availableLoggers: LoggerInfo[] = loggersResult?.result?.loggers || [];

    // Use the reusable argument check node with model for persona-aware prompts
    return argumentCheckNode(state, availableLoggers, model);
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

  // Routing function: has required args or wants all devices?
  const checkArgsResult = (state: ExplicitFlowState): 'proceed' | 'wait' => {
    // If user wants all devices, skip argument check
    if (state.flowContext.analyzeAllLoggers) {
      return 'proceed';
    }
    // Use the reusable hasRequiredArgs function
    return hasRequiredArgs(state);
  };

  // Routing function: needs recovery?
  const needsRecovery = (state: ExplicitFlowState): 'recovery' | 'continue' => {
    return state.flowContext.toolResults?.needsRecovery
      ? 'recovery'
      : 'continue';
  };

  // Build the subgraph
  // Flow: fetch_loggers → check_args → [wait|proceed] → analyze_health → render_report
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('fetch_loggers', fetchLoggersNode)
    .addNode('check_args', checkArgsNode)
    .addNode('analyze_health', analyzeHealthNode)
    .addNode('render_report', renderReportNode)
    .addEdge(START, 'fetch_loggers')
    .addEdge('fetch_loggers', 'check_args')
    .addConditionalEdges('check_args', checkArgsResult, {
      proceed: 'analyze_health',
      wait: END, // Pause for user input - next turn will re-enter with selection
    })
    .addConditionalEdges('analyze_health', needsRecovery, {
      recovery: END, // Trigger recovery subgraph
      continue: 'render_report',
    })
    .addEdge('render_report', END);

  return graph.compile();
}
