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
  FleetStatusSnapshot,
} from '../types/flow-state';
import { executeTool, generateToolCallId } from './flow-utils';
import { UIResponseBuilder } from '../response';
import {
  NarrativeEngine,
  NarrativeContext,
  DEFAULT_NARRATIVE_PREFERENCES,
  createDefaultDataQuality,
  buildTemporalContext,
} from '../narrative';

const logger = new Logger('MorningBriefingFlow');

/**
 * Date mismatch information when viewing historical data.
 */
interface DateMismatchInfo {
  requestedDate: string;
  actualDataDate: string;
  daysDifference: number;
  isHistorical: boolean;
}

/**
 * Fleet overview response structure (matches Python ai/tools/fleet.py).
 */
interface FleetOverviewResult {
  status: {
    totalLoggers: number;
    activeLoggers: number;
    percentOnline: number;
    fleetHealth: string;
  };
  production: {
    currentTotalPowerWatts: number;
    todayTotalEnergyKwh: number;
    siteAvgIrradiance: number;
  };
  timestamp?: string;
  dateMismatch?: DateMismatchInfo;
  offlineLoggers?: string[];
  summary?: string;
}

/**
 * Error diagnosis response structure.
 */
interface DiagnosisResult {
  errors?: Array<{ code: string; description: string; count: number }>;
  summary?: string;
}

/**
 * Morning Briefing Flow
 *
 * Steps:
 * 1. fleet_overview: Call get_fleet_overview to get site-wide status
 * 2. check_critical: Check if percentOnline < 100%
 * 3. diagnose_issues (conditional): If issues found, call diagnose_error_codes
 * 4. render_briefing: Render FleetOverview component with suggestions
 */
export function createMorningBriefingFlow(
  httpClient: ToolsHttpClient,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
) {
  // Step 1: Fetch fleet overview
  const fleetOverviewNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Morning Briefing: Fetching fleet overview');

    const toolCallId = generateToolCallId();
    const result = await executeTool<FleetOverviewResult>(
      httpClient,
      'get_fleet_overview',
      {},
    );

    logger.debug(
      `Fleet overview result: ${result.status} - ${JSON.stringify(result.result?.status)}`,
    );

    // Store result in flow context
    return {
      flowStep: 1,
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          fleet_overview: result,
        },
      },
      // Add pending UI action for tool-input-available event
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'get_fleet_overview',
          args: {},
        },
      ],
    };
  };

  // Step 2: Check if there are critical issues
  const checkCriticalNode = (
    state: ExplicitFlowState,
  ): Partial<ExplicitFlowState> => {
    logger.debug('Morning Briefing: Checking critical status');

    const fleetResult = state.flowContext.toolResults?.fleet_overview as
      | ToolResponse<FleetOverviewResult>
      | undefined;
    const percentOnline = fleetResult?.result?.status?.percentOnline ?? 100;

    logger.debug(`Percent online: ${percentOnline}%`);

    return {
      flowStep: 2,
      flowContext: {
        ...state.flowContext,
        toolResults: {
          ...state.flowContext.toolResults,
          hasIssues: percentOnline < 100,
          offlineLoggers: fleetResult?.result?.offlineLoggers || [],
        },
      },
    };
  };

  // Step 3 (conditional): Diagnose issues if any
  const diagnoseIssuesNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Morning Briefing: Diagnosing issues');

    const offlineLoggers = state.flowContext.toolResults?.offlineLoggers as
      | string[]
      | undefined;

    // If we have specific offline loggers, diagnose them
    // Otherwise, run a general diagnosis
    const toolCallId = generateToolCallId();

    if (offlineLoggers && offlineLoggers.length > 0) {
      // Diagnose first offline logger
      const result = await executeTool<DiagnosisResult>(
        httpClient,
        'diagnose_error_codes',
        {
          logger_id: offlineLoggers[0],
          days: 7,
        },
      );

      return {
        flowStep: 3,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            diagnosis: result,
          },
        },
        pendingUiActions: [
          {
            toolCallId,
            toolName: 'diagnose_error_codes',
            args: { logger_id: offlineLoggers[0], days: 7 },
          },
        ],
      };
    }

    // No specific loggers to diagnose - preserve context for render step
    return {
      flowStep: 3,
      flowContext: state.flowContext,
    };
  };

  // Step 4: Render briefing with LLM narrative
  const renderBriefingNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Morning Briefing: Rendering briefing');

    const fleetResult = state.flowContext.toolResults?.fleet_overview as
      | ToolResponse<FleetOverviewResult>
      | undefined;
    const hasIssues = state.flowContext.toolResults?.hasIssues as boolean;
    const diagnosis = state.flowContext.toolResults?.diagnosis as
      | ToolResponse<DiagnosisResult>
      | undefined;

    // FIX #5: Early exit if fleet data unavailable - TRIGGER RECOVERY instead of dead-end
    if (!fleetResult?.result) {
      logger.warn(
        `Fleet overview data unavailable: ${fleetResult?.message || 'missing'}`,
      );

      // Provide helpful guidance instead of generic error
      const helpfulMessage = new AIMessage({
        content: `I don't see any solar data in the system yet. To get started:

1. **Upload your data** - Go to the **Upload** section in the dashboard
2. **Connect your inverters** - Upload CSV or other data files from your solar monitoring system
3. **Come back here** - Once you have data, I can show you your fleet status, savings, and more!

Would you like me to explain what data formats I can work with?`,
      });

      return {
        messages: [helpfulMessage],
        flowStep: 4,
        flowContext: {
          ...state.flowContext,
          toolResults: {
            ...state.flowContext.toolResults,
            needsRecovery: true,
            recoveryType: 'no_data',
          },
        },
      };
    }

    const toolCallId = generateToolCallId();

    // Extract date mismatch info - fleetData is now guaranteed to exist
    const fleetData = fleetResult.result;
    const dateMismatch = fleetData.dateMismatch;

    // Calculate offline count from total - active
    const totalLoggers = fleetData?.status?.totalLoggers ?? 0;
    const activeLoggers = fleetData?.status?.activeLoggers ?? 0;
    const offlineCount = totalLoggers - activeLoggers;

    // Build props for FleetOverview component - include date mismatch info
    const props = {
      totalPower: (fleetData?.production?.currentTotalPowerWatts ?? 0) / 1000, // Convert W to kW
      totalEnergy: fleetData?.production?.todayTotalEnergyKwh ?? 0,
      deviceCount: totalLoggers,
      onlineCount: activeLoggers,
      percentOnline: fleetData?.status?.percentOnline ?? 100,
      dataTimestamp: fleetData?.timestamp || null,
      dateMismatch: dateMismatch || null,
      alerts: hasIssues
        ? [
            {
              type: 'warning' as const,
              message: `${offlineCount} device(s) offline`,
            },
          ]
        : [],
    };

    // Build NarrativeContext for fleet overview
    const narrativeEngine = new NarrativeEngine(model);
    const preferences =
      state.flowContext.narrativePreferences || DEFAULT_NARRATIVE_PREFERENCES;

    // Get offline loggers for temporal comparison - fleetData is guaranteed to exist
    const currentOfflineLoggers = fleetData.offlineLoggers || [];

    // Build temporal context from previous state (if available)
    const temporalContext = buildTemporalContext(
      {
        percentOnline: props.percentOnline,
        offlineLoggers: currentOfflineLoggers,
      },
      state.flowContext.previousFleetStatus,
    );

    logger.debug(
      `Temporal context: trend=${temporalContext.trend}, daysTracked=${temporalContext.daysTracked}`,
    );

    const narrativeContext: NarrativeContext = {
      flowType: 'morning_briefing',
      subject: 'fleet',
      data: {
        totalPower: props.totalPower,
        totalEnergy: props.totalEnergy,
        deviceCount: props.deviceCount,
        onlineCount: props.onlineCount,
        percentOnline: props.percentOnline,
        anomalies: hasIssues
          ? [
              {
                type: 'offline_devices',
                severity: 'medium' as const,
                description:
                  diagnosis?.result?.summary || 'Some devices are offline',
              },
            ]
          : [],
        healthScore: props.percentOnline,
      },
      dataQuality: dateMismatch?.isHistorical
        ? {
            completeness: 100,
            isExpectedWindow: false,
            actualWindow: {
              start: dateMismatch.actualDataDate,
              end: dateMismatch.actualDataDate,
            },
          }
        : createDefaultDataQuality(),
      isFleetAnalysis: true,
      fleetSize: props.deviceCount,
      // Add temporal context for "compared to yesterday" narratives
      temporalContext,
      // Update historical context with trend from temporal
      historicalContext: {
        isRecurrent: false,
        trend: temporalContext.trend === 'declining' ? 'degrading' : 'stable',
      },
    };

    // Generate narrative and suggestions using NarrativeEngine
    const narrativeResult = await narrativeEngine.generate(
      narrativeContext,
      preferences,
    );
    const suggestions = narrativeEngine.generateSuggestions(narrativeContext);

    logger.debug(
      `Morning briefing narrative generated via branch: ${narrativeResult.metadata.branchPath}`,
    );

    const narrative = narrativeResult.narrative;

    const renderArgs = UIResponseBuilder.fleetOverview(props, suggestions);

    // Create AI message with render_ui_component tool call
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

    // Create snapshot for next briefing (temporal continuity)
    const statusSnapshot: FleetStatusSnapshot = {
      timestamp: new Date().toISOString(),
      percentOnline: props.percentOnline,
      totalPower: props.totalPower,
      totalEnergy: props.totalEnergy,
      offlineLoggers: currentOfflineLoggers,
      healthScore: props.percentOnline,
    };

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
        // Store snapshot for next briefing (session-only persistence)
        previousFleetStatus: statusSnapshot,
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

  // Routing function: should diagnose issues?
  // Auto-diagnose when user selects a logger or when offline devices exist
  const shouldDiagnose = (state: ExplicitFlowState): 'diagnose' | 'render' => {
    const offlineLoggers =
      (state.flowContext.toolResults?.offlineLoggers as string[]) || [];
    const selectedLogger = state.flowContext.selectedLoggerId;

    // If user selected a logger, auto-proceed to diagnosis
    if (selectedLogger) {
      logger.debug(
        `Auto-routing to diagnosis for selected logger: ${selectedLogger}`,
      );
      return 'diagnose';
    }

    // If offline devices exist, diagnose them
    if (offlineLoggers.length > 0) {
      logger.debug(
        `Auto-routing to diagnosis: ${offlineLoggers.length} offline devices`,
      );
      return 'diagnose';
    }

    // No issues - skip to render
    return 'render';
  };

  // Build the subgraph
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('fleet_overview', fleetOverviewNode)
    .addNode('check_critical', checkCriticalNode)
    .addNode('diagnose_issues', diagnoseIssuesNode)
    .addNode('render_briefing', renderBriefingNode)
    .addEdge(START, 'fleet_overview')
    .addEdge('fleet_overview', 'check_critical')
    .addConditionalEdges('check_critical', shouldDiagnose, {
      diagnose: 'diagnose_issues',
      render: 'render_briefing',
    })
    .addEdge('diagnose_issues', 'render_briefing')
    .addEdge('render_briefing', END);

  return graph.compile();
}
