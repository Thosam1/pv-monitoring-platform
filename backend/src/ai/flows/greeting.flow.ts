import { Logger } from '@nestjs/common';
import { StateGraph, START, END } from '@langchain/langgraph';
import { AIMessage } from '@langchain/core/messages';
import { ToolsHttpClient } from '../tools-http.client';
import {
  ExplicitFlowState,
  ExplicitFlowStateAnnotation,
} from '../types/flow-state';
import { executeTool } from './flow-utils';
import {
  TimeOfDay,
  getTimeOfDayFromHour,
  getCurrentHourInTimezone,
  selectGreetingTemplate,
  formatCapabilityList,
} from '../narrative/narrative-identity';

const logger = new Logger('GreetingFlow');

/**
 * Fleet overview response structure (subset for greeting).
 */
interface FleetOverviewResult {
  site: {
    totalLoggers: number;
    onlineLoggers: number;
    offlineLoggers: string[];
    percentOnline: number;
  };
  production: {
    currentPowerWatts: number;
    todayEnergyKwh: number;
  };
  health: {
    overallScore: number;
    status: 'healthy' | 'warning' | 'critical';
  };
}

/**
 * Build a brief fleet summary for the greeting.
 * Returns null if no meaningful data is available.
 */
function buildFleetSummary(
  fleetData: FleetOverviewResult | undefined,
): string | null {
  if (!fleetData) return null;

  const { site, health } = fleetData;

  // No loggers means no data to report
  if (site.totalLoggers === 0) return null;

  const parts: string[] = [];

  // Device status
  if (site.totalLoggers === 1) {
    parts.push(
      site.onlineLoggers === 1
        ? 'your inverter is online'
        : 'your inverter appears offline',
    );
  } else {
    parts.push(`${site.onlineLoggers} of ${site.totalLoggers} devices online`);
  }

  // Health status
  if (health.status === 'healthy') {
    parts.push('everything looks good');
  } else if (health.status === 'warning') {
    parts.push('a few things worth checking');
  } else if (health.status === 'critical') {
    parts.push('some issues need attention');
  }

  if (parts.length === 0) return null;

  return `Quick check: ${parts.join(', ')}.`;
}

/**
 * Build the complete greeting message.
 */
function buildGreetingMessage(
  timeOfDay: TimeOfDay,
  fleetSummary: string | null,
): string {
  const greeting = selectGreetingTemplate(timeOfDay, 'standard');
  const capabilities = formatCapabilityList();

  const sections = [
    greeting,
    '',
    "Here's what I can help you with:",
    capabilities,
  ];

  if (fleetSummary) {
    sections.push('', fleetSummary);
  }

  sections.push('', 'What would you like to explore?');

  return sections.join('\n');
}

/**
 * Greeting Flow
 *
 * A simple, fast flow that:
 * 1. Generates a time-aware greeting with Sunny persona
 * 2. Lists curated capabilities
 * 3. Optionally includes a brief fleet status summary
 *
 * This flow does NOT require LLM calls - responses are pre-templated.
 */
export function createGreetingFlow(httpClient: ToolsHttpClient) {
  // Single node: generate greeting with optional fleet summary
  const greetingNode = async (
    state: ExplicitFlowState,
  ): Promise<Partial<ExplicitFlowState>> => {
    logger.debug('Greeting Flow: Generating greeting');

    // Determine time of day
    const timezone = state.flowContext?.userTimezone;
    const hour = getCurrentHourInTimezone(timezone);
    const timeOfDay = getTimeOfDayFromHour(hour);

    logger.debug(
      `Time context: hour=${hour}, timeOfDay=${timeOfDay}, timezone=${timezone || 'UTC'}`,
    );

    // Try to get fleet overview for optional summary
    let fleetData: FleetOverviewResult | undefined;

    try {
      const fleetResult = await executeTool<FleetOverviewResult>(
        httpClient,
        'get_fleet_overview',
        {},
      );

      if (fleetResult.status === 'ok' || fleetResult.status === 'success') {
        fleetData = fleetResult.result;
        logger.debug(
          `Fleet data retrieved: ${fleetData?.site?.totalLoggers} loggers, status=${fleetData?.health?.status}`,
        );
      }
    } catch (error) {
      // Fleet overview is optional - log and continue without it
      logger.debug(`Fleet overview unavailable: ${error}`);
    }

    // Build the greeting message
    const fleetSummary = buildFleetSummary(fleetData);
    const greetingMessage = buildGreetingMessage(timeOfDay, fleetSummary);

    // Create simple AI message with greeting text (no tool calls needed)
    const aiMessage = new AIMessage({
      content: greetingMessage,
    });

    return {
      messages: [aiMessage],
      flowStep: 1,
    };
  };

  // Build the simple graph: START -> greeting -> END
  const graph = new StateGraph(ExplicitFlowStateAnnotation)
    .addNode('greeting', greetingNode)
    .addEdge(START, 'greeting')
    .addEdge('greeting', END);

  return graph.compile();
}
