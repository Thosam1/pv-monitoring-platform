#!/usr/bin/env npx ts-node
/**
 * Graph Flow Simulation Script
 *
 * Simulates the explicit flow graph execution without requiring LLM or HTTP calls.
 * Useful for testing flow routing and state transitions.
 *
 * Usage:
 *   npx ts-node scripts/simulate-flow.ts "morning briefing"
 *   npx ts-node scripts/simulate-flow.ts "how much did I save this month"
 *   npx ts-node scripts/simulate-flow.ts "compare loggers 925 and 926"
 *   npx ts-node scripts/simulate-flow.ts "check health of logger 925"
 */

import { HumanMessage } from '@langchain/core/messages';
import {
  FlowType,
  ExplicitFlowState,
  FlowContext,
} from '../src/ai/types/flow-state';

// Simple pattern-based classification (simulates LLM router)
function classifyIntent(message: string): {
  flow: FlowType;
  confidence: number;
  extractedParams: { loggerId?: string; loggerName?: string; date?: string };
} {
  const lowerMsg = message.toLowerCase();
  const extractedParams: {
    loggerId?: string;
    loggerName?: string;
    date?: string;
  } = {};

  // Extract logger ID
  const loggerIdMatch = lowerMsg.match(
    /logger\s*(\d+)|inverter\s*(\d+)|id\s*(\d+)/,
  );
  if (loggerIdMatch) {
    extractedParams.loggerId =
      loggerIdMatch[1] || loggerIdMatch[2] || loggerIdMatch[3];
  }

  // Extract date
  const dateMatch = lowerMsg.match(/(\d{4}-\d{2}-\d{2})|yesterday|today/);
  if (dateMatch) {
    if (dateMatch[0] === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      extractedParams.date = d.toISOString().split('T')[0];
    } else if (dateMatch[0] === 'today') {
      extractedParams.date = new Date().toISOString().split('T')[0];
    } else {
      extractedParams.date = dateMatch[0];
    }
  }

  // Classification rules
  if (
    lowerMsg.includes('compare') ||
    lowerMsg.includes('audit') ||
    lowerMsg.includes('performance')
  ) {
    return { flow: 'performance_audit', confidence: 0.9, extractedParams };
  }

  if (
    lowerMsg.includes('briefing') ||
    lowerMsg.includes('fleet') ||
    lowerMsg.includes('overview') ||
    lowerMsg.includes('status')
  ) {
    return { flow: 'morning_briefing', confidence: 0.9, extractedParams };
  }

  if (
    lowerMsg.includes('save') ||
    lowerMsg.includes('money') ||
    lowerMsg.includes('financial') ||
    lowerMsg.includes('cost') ||
    lowerMsg.includes('revenue')
  ) {
    return { flow: 'financial_report', confidence: 0.9, extractedParams };
  }

  if (
    lowerMsg.includes('health') ||
    lowerMsg.includes('anomal') ||
    lowerMsg.includes('error') ||
    lowerMsg.includes('issue') ||
    lowerMsg.includes('problem')
  ) {
    return { flow: 'health_check', confidence: 0.9, extractedParams };
  }

  // Default to free_chat
  return { flow: 'free_chat', confidence: 0.6, extractedParams };
}

// Mock tool execution results
function mockToolResult(
  toolName: string,
  _args: Record<string, unknown>,
): Record<string, unknown> {
  switch (toolName) {
    case 'list_loggers':
      return {
        status: 'success',
        result: {
          loggers: [
            {
              loggerId: '925',
              loggerType: 'goodwe',
              dataRange: { earliestData: '2024-01-01', latestData: '2024-12-01' },
            },
            {
              loggerId: '926',
              loggerType: 'lti',
              dataRange: { earliestData: '2024-03-15', latestData: '2024-12-01' },
            },
            {
              loggerId: '927',
              loggerType: 'meteocontrol',
              dataRange: { earliestData: '2024-06-01', latestData: '2024-12-01' },
            },
          ],
        },
      };

    case 'get_fleet_overview':
      return {
        status: 'success',
        result: {
          totalLoggers: 3,
          activeLoggers: 3,
          totalPowerNow: 4500,
          totalEnergyToday: 45.2,
          criticalIssues: [
            {
              loggerId: '925',
              issue: 'Communication timeout',
              severity: 'high',
            },
          ],
        },
      };

    case 'analyze_inverter_health':
      return {
        status: 'success',
        result: {
          anomalies: [
            {
              timestamp: '2024-12-01T10:00:00Z',
              type: 'power_drop',
              description: 'Unexpected power drop of 40%',
              severity: 'medium',
              metrics: { power: 1200, irradiance: 800 },
            },
          ],
          summary: {
            totalAnomalies: 1,
            healthScore: 85,
            period: '7 days',
          },
        },
      };

    case 'calculate_financial_savings':
      return {
        status: 'success',
        result: {
          energyGenerated: 1250.5,
          savings: 250.1,
          co2Offset: 625.25,
          treesEquivalent: 12,
          period: { start: '2024-11-01', end: '2024-12-01' },
        },
      };

    case 'forecast_production':
      return {
        status: 'success',
        result: {
          forecasts: [
            { date: '2024-12-02', predictedEnergy: 42.5 },
            { date: '2024-12-03', predictedEnergy: 38.2 },
          ],
          totalPredicted: 280.7,
        },
      };

    case 'compare_loggers':
      return {
        status: 'success',
        result: {
          data: [
            { timestamp: '2024-12-01T08:00:00Z', '925': 500, '926': 480 },
            { timestamp: '2024-12-01T12:00:00Z', '925': 2500, '926': 2300 },
          ],
          summary: {
            '925': { average: 1500, peak: 2500, total: 15000 },
            '926': { average: 1390, peak: 2300, total: 13900 },
          },
          metric: 'power',
          date: '2024-12-01',
        },
      };

    default:
      return { status: 'success', result: {} };
  }
}

// Simulate flow execution
function simulateFlow(userMessage: string): void {
  console.log('\n' + '='.repeat(60));
  console.log('USER MESSAGE:', userMessage);
  console.log('='.repeat(60));

  // Step 1: Router classification
  const classification = classifyIntent(userMessage);
  console.log('\n[ROUTER] Classification:');
  console.log('  Flow:', classification.flow);
  console.log('  Confidence:', classification.confidence);
  console.log('  Extracted Params:', JSON.stringify(classification.extractedParams));

  // Initialize state
  const state: ExplicitFlowState = {
    messages: [new HumanMessage(userMessage)],
    recoveryAttempts: 0,
    pendingUiActions: [],
    activeFlow: classification.flow,
    flowStep: 0,
    flowContext: {
      selectedLoggerId: classification.extractedParams.loggerId,
      selectedDate: classification.extractedParams.date,
      extractedLoggerName: classification.extractedParams.loggerName,
    } as FlowContext,
  };

  // Step 2: Execute flow based on classification
  console.log('\n[FLOW] Executing:', classification.flow);

  switch (classification.flow) {
    case 'morning_briefing':
      simulateMorningBriefing(state);
      break;
    case 'financial_report':
      simulateFinancialReport(state);
      break;
    case 'performance_audit':
      simulatePerformanceAudit(state);
      break;
    case 'health_check':
      simulateHealthCheck(state);
      break;
    default:
      simulateFreeChat(state);
  }
}

function simulateMorningBriefing(state: ExplicitFlowState): void {
  console.log('\n  Step 1: Fleet Overview');
  const fleetResult = mockToolResult('get_fleet_overview', {});
  console.log('    Tool: get_fleet_overview');
  console.log('    Result:', JSON.stringify(fleetResult.result, null, 2).slice(0, 200) + '...');

  const fleet = fleetResult.result as { criticalIssues: Array<{ loggerId: string }> };
  console.log('\n  Step 2: Check Critical Issues');
  console.log('    Critical Issues Found:', fleet.criticalIssues.length);

  if (fleet.criticalIssues.length > 0) {
    console.log('\n  Step 3: Diagnose Issues (conditional)');
    const diagResult = mockToolResult('analyze_inverter_health', {
      logger_id: fleet.criticalIssues[0].loggerId,
    });
    console.log('    Tool: analyze_inverter_health');
    console.log('    Logger:', fleet.criticalIssues[0].loggerId);
    console.log('    Result:', JSON.stringify(diagResult.result, null, 2).slice(0, 200) + '...');
  }

  console.log('\n  Step 4: Render Briefing');
  console.log('    UI Component: FleetOverview');
  console.log('    Suggestions: ["Check specific logger", "View financial report", "Compare loggers"]');

  console.log('\n[COMPLETE] Morning Briefing flow finished');
  console.log('  Final State:', { activeFlow: state.activeFlow, flowStep: 4 });
}

function simulateFinancialReport(state: ExplicitFlowState): void {
  console.log('\n  Step 1: Check Context');
  const hasLogger = !!state.flowContext.selectedLoggerId;
  console.log('    Logger Pre-selected:', hasLogger);

  if (!hasLogger) {
    console.log('\n  Step 2: Select Logger (user input required)');
    const loggersResult = mockToolResult('list_loggers', {});
    console.log('    Tool: list_loggers');
    console.log('    UI Action: request_user_selection (dropdown)');
    console.log('    [PAUSED] Waiting for user selection...');

    // Simulate user selection
    state.flowContext.selectedLoggerId = '925';
    console.log('    [RESUMED] User selected: 925');
  }

  console.log('\n  Step 3: Calculate Savings');
  const savingsResult = mockToolResult('calculate_financial_savings', {
    logger_id: state.flowContext.selectedLoggerId,
  });
  console.log('    Tool: calculate_financial_savings');
  console.log('    Result:', JSON.stringify(savingsResult.result, null, 2).slice(0, 200) + '...');

  console.log('\n  Step 4: Forecast Production');
  const forecastResult = mockToolResult('forecast_production', {
    logger_id: state.flowContext.selectedLoggerId,
  });
  console.log('    Tool: forecast_production');
  console.log('    Result:', JSON.stringify(forecastResult.result, null, 2).slice(0, 150) + '...');

  console.log('\n  Step 5: Render Report');
  console.log('    UI Component: FinancialReport');
  console.log('    Suggestions: ["Adjust electricity rate", "View monthly trend", "Compare with last month"]');

  console.log('\n[COMPLETE] Financial Report flow finished');
  console.log('  Final State:', { activeFlow: state.activeFlow, flowStep: 5 });
}

function simulatePerformanceAudit(state: ExplicitFlowState): void {
  console.log('\n  Step 1: Discover Loggers');
  const loggersResult = mockToolResult('list_loggers', {});
  console.log('    Tool: list_loggers');
  const loggers = (loggersResult.result as { loggers: Array<{ loggerId: string }> }).loggers;
  console.log('    Found:', loggers.length, 'loggers');

  console.log('\n  Step 2: Select Loggers (multi-select)');
  console.log('    UI Action: request_user_selection (multiple, dropdown)');
  console.log('    [PAUSED] Waiting for user selection (2-5 loggers)...');

  // Simulate user selection
  state.flowContext.selectedLoggerIds = ['925', '926'];
  console.log('    [RESUMED] User selected:', state.flowContext.selectedLoggerIds);

  console.log('\n  Step 3: Compare Loggers');
  const compareResult = mockToolResult('compare_loggers', {
    logger_ids: state.flowContext.selectedLoggerIds,
  });
  console.log('    Tool: compare_loggers');
  console.log('    Result:', JSON.stringify(compareResult.result, null, 2).slice(0, 200) + '...');

  console.log('\n  Step 4: Render Chart');
  console.log('    UI Component: ComparisonChart (multi-line)');
  console.log('    Suggestions: ["Expand date range", "Add another logger", "View health report"]');

  console.log('\n[COMPLETE] Performance Audit flow finished');
  console.log('  Final State:', { activeFlow: state.activeFlow, flowStep: 4 });
}

function simulateHealthCheck(state: ExplicitFlowState): void {
  console.log('\n  Step 1: Check Context');
  const hasLogger = !!state.flowContext.selectedLoggerId;
  console.log('    Logger Pre-selected:', hasLogger);

  if (!hasLogger) {
    console.log('\n  Step 2: Select Logger (user input required)');
    const loggersResult = mockToolResult('list_loggers', {});
    console.log('    Tool: list_loggers');
    console.log('    UI Action: request_user_selection (dropdown)');
    console.log('    [PAUSED] Waiting for user selection...');

    // Simulate user selection
    state.flowContext.selectedLoggerId = '925';
    console.log('    [RESUMED] User selected: 925');
  }

  console.log('\n  Step 3: Analyze Health');
  const healthResult = mockToolResult('analyze_inverter_health', {
    logger_id: state.flowContext.selectedLoggerId,
    days: 7,
  });
  console.log('    Tool: analyze_inverter_health');
  console.log('    Result:', JSON.stringify(healthResult.result, null, 2).slice(0, 200) + '...');

  console.log('\n  Step 4: Render Report');
  console.log('    UI Component: HealthReport');
  console.log('    Suggestions: ["Drill into anomaly", "Compare with another logger", "View power curve"]');

  console.log('\n[COMPLETE] Health Check flow finished');
  console.log('  Final State:', { activeFlow: state.activeFlow, flowStep: 4 });
}

function simulateFreeChat(state: ExplicitFlowState): void {
  console.log('\n  Free Chat Mode');
  console.log('  This query will be handled by the ReAct agent with tool calling');
  console.log('  Available tools: get_power_curve, list_loggers, etc.');
  console.log('\n[COMPLETE] Free Chat (delegated to ReAct agent)');
  console.log('  Final State:', { activeFlow: state.activeFlow, flowStep: 0 });
}

// Main execution
const userMessage = process.argv.slice(2).join(' ') || 'Give me a morning briefing';
simulateFlow(userMessage);

console.log('\n' + '='.repeat(60));
console.log('Simulation complete. Run with different messages to test flows:');
console.log('  npx ts-node scripts/simulate-flow.ts "morning briefing"');
console.log('  npx ts-node scripts/simulate-flow.ts "how much money did I save"');
console.log('  npx ts-node scripts/simulate-flow.ts "compare loggers 925 and 926"');
console.log('  npx ts-node scripts/simulate-flow.ts "check health of logger 925"');
console.log('  npx ts-node scripts/simulate-flow.ts "show me power curve for today"');
console.log('='.repeat(60) + '\n');
