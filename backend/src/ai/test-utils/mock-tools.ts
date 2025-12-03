/**
 * Mock tool responses for unit testing.
 *
 * These responses match the structure returned by the Python HTTP API,
 * allowing tests to run without network calls.
 */

/**
 * Standard tool response status codes.
 */
export type ToolStatus =
  | 'ok'
  | 'success'
  | 'no_data'
  | 'no_data_in_window'
  | 'error';

/**
 * Mock response for list_loggers tool.
 */
export const MOCK_LIST_LOGGERS = {
  status: 'ok' as ToolStatus,
  result: {
    loggers: [
      {
        loggerId: '925',
        loggerType: 'goodwe',
        recordCount: 15000,
        dataRange: {
          earliestData: '2024-06-01T00:00:00Z',
          latestData: '2025-01-15T23:45:00Z',
        },
      },
      {
        loggerId: '926',
        loggerType: 'lti',
        recordCount: 8500,
        dataRange: {
          earliestData: '2024-08-15T00:00:00Z',
          latestData: '2025-01-15T23:30:00Z',
        },
      },
      {
        loggerId: 'MBMET-001',
        loggerType: 'mbmet',
        recordCount: 12000,
        dataRange: {
          earliestData: '2024-07-01T00:00:00Z',
          latestData: '2025-01-15T23:00:00Z',
        },
      },
    ],
  },
};

/**
 * Mock response for analyze_inverter_health with anomalies.
 */
export const MOCK_HEALTH_WITH_ANOMALIES = {
  status: 'ok' as ToolStatus,
  result: {
    anomalies: [
      {
        timestamp: '2025-01-10T10:30:00Z',
        type: 'daytime_outage',
        description: 'Zero power output during sunny conditions',
        severity: 'high' as const,
        metrics: {
          power: 0,
          irradiance: 450,
        },
      },
      {
        timestamp: '2025-01-12T14:15:00Z',
        type: 'underperformance',
        description: 'Power output 40% below expected',
        severity: 'medium' as const,
        metrics: {
          power: 2100,
          irradiance: 680,
        },
      },
    ],
    summary: {
      totalAnomalies: 2,
      healthScore: 78,
      period: 'Last 7 days',
    },
    status: 'ok',
  },
};

/**
 * Mock response for analyze_inverter_health with no anomalies.
 */
export const MOCK_HEALTH_CLEAN = {
  status: 'ok' as ToolStatus,
  result: {
    anomalies: [],
    summary: {
      totalAnomalies: 0,
      healthScore: 100,
      period: 'Last 7 days',
    },
    status: 'ok',
  },
};

/**
 * Mock response for get_power_curve tool.
 */
export const MOCK_POWER_CURVE = {
  status: 'ok' as ToolStatus,
  result: {
    data: [
      { timestamp: '2025-01-10T06:00:00Z', power: 0, irradiance: 0 },
      { timestamp: '2025-01-10T08:00:00Z', power: 1200, irradiance: 350 },
      { timestamp: '2025-01-10T10:00:00Z', power: 3500, irradiance: 620 },
      { timestamp: '2025-01-10T12:00:00Z', power: 5200, irradiance: 850 },
      { timestamp: '2025-01-10T14:00:00Z', power: 4800, irradiance: 780 },
      { timestamp: '2025-01-10T16:00:00Z', power: 2100, irradiance: 380 },
      { timestamp: '2025-01-10T18:00:00Z', power: 200, irradiance: 50 },
    ],
    summaryStats: {
      peakValue: 5200,
      peakTime: '2025-01-10T12:00:00Z',
      avgValue: 2428,
      totalEnergy: 42.5,
      trend: 'stable' as const,
    },
  },
};

/**
 * Mock response for get_fleet_overview tool.
 */
export const MOCK_FLEET_OVERVIEW = {
  status: 'ok' as ToolStatus,
  result: {
    totalPower: 15600,
    totalEnergyToday: 85.2,
    activeDevices: 3,
    totalDevices: 3,
    offlineDevices: 0,
    lastUpdate: '2025-01-15T14:30:00Z',
    breakdown: [
      { loggerId: '925', loggerType: 'goodwe', power: 5200, status: 'online' },
      { loggerId: '926', loggerType: 'lti', power: 4800, status: 'online' },
      {
        loggerId: 'MBMET-001',
        loggerType: 'mbmet',
        power: 5600,
        status: 'online',
      },
    ],
  },
};

/**
 * Mock response for calculate_financial_savings tool.
 */
export const MOCK_FINANCIAL_SAVINGS = {
  status: 'ok' as ToolStatus,
  result: {
    energyGenerated: 1250.5,
    savings: 250.1,
    co2Offset: 1063.0,
    treesEquivalent: 48,
    period: { start: '2024-12-01', end: '2024-12-31' },
    electricityRate: 0.2,
    currency: 'USD',
    projectedAnnualSavings: 3001.2,
  },
};

/**
 * Mock response for compare_loggers tool.
 */
export const MOCK_COMPARE_LOGGERS = {
  status: 'ok' as ToolStatus,
  result: {
    period: 'Last 7 days',
    loggers: [
      {
        loggerId: '925',
        loggerType: 'goodwe',
        totalEnergy: 285.3,
        peakPower: 5200,
        avgPower: 1695,
        efficiency: 92.5,
      },
      {
        loggerId: '926',
        loggerType: 'lti',
        totalEnergy: 262.1,
        peakPower: 4800,
        avgPower: 1557,
        efficiency: 88.2,
      },
    ],
    winner: '925',
    comparison: {
      energyDifference: 23.2,
      efficiencyDifference: 4.3,
    },
  },
};

/**
 * Mock response for calculate_performance_ratio tool.
 */
export const MOCK_PERFORMANCE_RATIO = {
  status: 'ok' as ToolStatus,
  result: {
    performanceRatio: 0.82,
    theoreticalEnergy: 310.5,
    actualEnergy: 254.6,
    period: 'Last 7 days',
    rating: 'Good',
    factors: {
      temperature: -2.5,
      shading: -1.0,
      soiling: -0.5,
    },
  },
};

/**
 * Mock response for forecast_production tool.
 */
export const MOCK_FORECAST = {
  status: 'ok' as ToolStatus,
  result: {
    forecastDays: 7,
    dailyForecasts: [
      { date: '2025-01-16', predictedEnergy: 42.5, confidence: 0.85 },
      { date: '2025-01-17', predictedEnergy: 38.2, confidence: 0.82 },
      { date: '2025-01-18', predictedEnergy: 45.1, confidence: 0.8 },
      { date: '2025-01-19', predictedEnergy: 41.0, confidence: 0.78 },
      { date: '2025-01-20', predictedEnergy: 39.5, confidence: 0.75 },
      { date: '2025-01-21', predictedEnergy: 44.2, confidence: 0.72 },
      { date: '2025-01-22', predictedEnergy: 40.8, confidence: 0.7 },
    ],
    totalPredicted: 291.3,
    avgConfidence: 0.77,
  },
};

/**
 * Mock response for diagnose_error_codes tool.
 */
export const MOCK_DIAGNOSE_ERRORS = {
  status: 'ok' as ToolStatus,
  result: {
    errors: [
      {
        code: 'E201',
        timestamp: '2025-01-14T09:30:00Z',
        description: 'Grid voltage out of range',
        severity: 'medium' as const,
        recommendation: 'Check grid connection and voltage levels',
      },
    ],
    summary: {
      totalErrors: 1,
      criticalCount: 0,
      mediumCount: 1,
      lowCount: 0,
    },
  },
};

/**
 * Mock response for no_data_in_window status.
 */
export const MOCK_NO_DATA_IN_WINDOW = {
  status: 'no_data_in_window' as ToolStatus,
  message: 'No data available for 2025-01-20',
  availableRange: {
    start: '2024-06-01',
    end: '2025-01-15',
  },
};

/**
 * Mock response for no_data status.
 */
export const MOCK_NO_DATA = {
  status: 'no_data' as ToolStatus,
  message: 'Logger 999 has no data available',
  availableRange: {
    start: null,
    end: null,
  },
};

/**
 * Mock response for error status.
 */
export const MOCK_ERROR = {
  status: 'error' as ToolStatus,
  message: 'Database connection failed',
};

/**
 * Map of tool names to their mock responses.
 */
export const MOCK_TOOL_RESPONSES: Record<string, unknown> = {
  list_loggers: MOCK_LIST_LOGGERS,
  analyze_inverter_health: MOCK_HEALTH_WITH_ANOMALIES,
  get_power_curve: MOCK_POWER_CURVE,
  get_fleet_overview: MOCK_FLEET_OVERVIEW,
  calculate_financial_savings: MOCK_FINANCIAL_SAVINGS,
  compare_loggers: MOCK_COMPARE_LOGGERS,
  calculate_performance_ratio: MOCK_PERFORMANCE_RATIO,
  forecast_production: MOCK_FORECAST,
  diagnose_error_codes: MOCK_DIAGNOSE_ERRORS,
};

/**
 * Create a mock ToolsHttpClient for testing.
 *
 * @param overrides - Optional response overrides by tool name
 * @returns Mocked ToolsHttpClient methods
 *
 * @example
 * ```typescript
 * const mockClient = createMockToolsClient({
 *   analyze_inverter_health: MOCK_HEALTH_CLEAN
 * });
 * ```
 */
export function createMockToolsClient(
  overrides: Record<string, unknown> = {},
): {
  executeTool: jest.Mock;
  isConnected: jest.Mock;
  getToolSchemas: jest.Mock;
} {
  const responses = { ...MOCK_TOOL_RESPONSES, ...overrides };

  return {
    executeTool: jest.fn((toolName: string) => {
      const response = responses[toolName];
      if (response) {
        // Return the full ToolResponse structure (with status and result)
        // The flow-utils.executeTool expects this structure
        return Promise.resolve(response);
      }
      return Promise.reject(new Error(`Unknown tool: ${toolName}`));
    }),
    isConnected: jest.fn(() => true),
    getToolSchemas: jest.fn(() => ({
      list_loggers: { description: 'List available loggers', parameters: {} },
      analyze_inverter_health: {
        description: 'Analyze health',
        parameters: { logger_id: { type: 'string' } },
      },
      get_power_curve: {
        description: 'Get power curve',
        parameters: { logger_id: { type: 'string' }, date: { type: 'string' } },
      },
      get_fleet_overview: { description: 'Get fleet overview', parameters: {} },
      calculate_financial_savings: {
        description: 'Calculate savings',
        parameters: { logger_id: { type: 'string' } },
      },
      compare_loggers: {
        description: 'Compare loggers',
        parameters: { logger_ids: { type: 'array' } },
      },
      calculate_performance_ratio: {
        description: 'Calculate PR',
        parameters: { logger_id: { type: 'string' } },
      },
      forecast_production: {
        description: 'Forecast production',
        parameters: { logger_id: { type: 'string' } },
      },
      diagnose_error_codes: {
        description: 'Diagnose errors',
        parameters: { logger_id: { type: 'string' } },
      },
    })),
  };
}

/**
 * Helper to create a ToolsHttpClient mock that returns specific responses per call.
 *
 * @param callResponses - Array of responses to return in order
 * @returns Mocked executeTool function
 *
 * @example
 * ```typescript
 * const executeTool = createSequentialMock([
 *   MOCK_LIST_LOGGERS.result,
 *   MOCK_HEALTH_WITH_ANOMALIES.result,
 * ]);
 * ```
 */
export function createSequentialMock(callResponses: unknown[]): jest.Mock {
  let callIndex = 0;
  return jest.fn(() => {
    const response = callResponses[callIndex];
    callIndex++;
    return Promise.resolve(response);
  });
}
