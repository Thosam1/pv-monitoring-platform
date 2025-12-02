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
  COMMON_SUGGESTIONS,
} from './flow-utils';

const logger = new Logger('MorningBriefingFlow');

/**
 * Fleet overview response structure.
 */
interface FleetOverviewResult {
  status: { totalPower: number; totalEnergy: number; percentOnline: number };
  devices: { total: number; online: number; offline: number };
  offlineLoggers?: string[];
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

    // No specific loggers to diagnose
    return {
      flowStep: 3,
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

    const toolCallId = generateToolCallId();

    // Build props for FleetOverview component
    const fleetData = fleetResult?.result;
    const props = {
      totalPower: fleetData?.status?.totalPower || 0,
      totalEnergy: fleetData?.status?.totalEnergy || 0,
      deviceCount: fleetData?.devices?.total || 0,
      onlineCount: fleetData?.devices?.online || 0,
      percentOnline: fleetData?.status?.percentOnline || 100,
      alerts: hasIssues
        ? [
            {
              type: 'warning',
              message: `${fleetData?.devices?.offline || 0} device(s) offline`,
            },
          ]
        : [],
    };

    // Get suggestions based on status
    const suggestions = COMMON_SUGGESTIONS.afterFleetOverview(hasIssues);

    // Generate LLM narrative
    const narrativePrompt = hasIssues
      ? `Generate a brief (2-3 sentences) morning briefing narrative.
         Total power: ${props.totalPower}W, Energy: ${props.totalEnergy}kWh.
         ${props.onlineCount}/${props.deviceCount} devices online (${props.percentOnline}%).
         Issues detected: ${diagnosis?.result?.summary || 'Some devices are offline'}.
         Be concise and focus on the key insight.`
      : `Generate a brief (2-3 sentences) morning briefing narrative.
         Total power: ${props.totalPower}W, Energy: ${props.totalEnergy}kWh.
         All ${props.deviceCount} devices online. System operating normally.
         Be positive but concise.`;

    let narrative = '';
    try {
      const response = await model.invoke([new HumanMessage(narrativePrompt)]);
      narrative =
        typeof response.content === 'string'
          ? response.content
          : 'Fleet status retrieved successfully.';
    } catch (error) {
      logger.warn(`Failed to generate narrative: ${error}`);
      narrative = hasIssues
        ? `Fleet status: ${props.onlineCount}/${props.deviceCount} devices online. Some issues detected.`
        : `Fleet status: All ${props.deviceCount} devices online. System operating normally.`;
    }

    // Create AI message with render_ui_component tool call
    const aiMessage = new AIMessage({
      content: narrative,
      tool_calls: [
        {
          id: toolCallId,
          name: 'render_ui_component',
          args: createRenderArgs('FleetOverview', props, suggestions),
        },
      ],
    });

    return {
      messages: [aiMessage],
      flowStep: 4,
      pendingUiActions: [
        {
          toolCallId,
          toolName: 'render_ui_component',
          args: createRenderArgs('FleetOverview', props, suggestions),
        },
      ],
    };
  };

  // Routing function: should diagnose issues?
  const shouldDiagnose = (state: ExplicitFlowState): 'diagnose' | 'render' => {
    const hasIssues = state.flowContext.toolResults?.hasIssues;
    return hasIssues ? 'diagnose' : 'render';
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
