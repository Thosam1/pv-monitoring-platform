/**
 * AI Module Test Utilities
 *
 * Re-exports all testing utilities for convenient imports:
 *
 * ```typescript
 * import {
 *   createFakeModel,
 *   createToolCallMessage,
 *   createMockToolsClient,
 *   createTestState,
 *   USER_MESSAGES,
 * } from './test-utils';
 * ```
 */

// Fake model utilities
export {
  createFakeModel,
  createFakeStreamingModel,
  createToolCallMessage,
  createMultiToolCallMessage,
  createTextWithToolMessage,
  createClassificationResponse,
  createErrorModel,
} from './fake-model';

// Mock tool responses
export {
  type ToolStatus,
  MOCK_LIST_LOGGERS,
  MOCK_HEALTH_WITH_ANOMALIES,
  MOCK_HEALTH_CLEAN,
  MOCK_POWER_CURVE,
  MOCK_FLEET_OVERVIEW,
  MOCK_FINANCIAL_SAVINGS,
  MOCK_COMPARE_LOGGERS,
  MOCK_PERFORMANCE_RATIO,
  MOCK_FORECAST,
  MOCK_DIAGNOSE_ERRORS,
  MOCK_NO_DATA_IN_WINDOW,
  MOCK_NO_DATA,
  MOCK_ERROR,
  MOCK_TOOL_RESPONSES,
  createMockToolsClient,
  createSequentialMock,
} from './mock-tools';

// Test fixtures
export {
  USER_MESSAGES,
  createTestState,
  createStateWithUserMessage,
  createStateWithHistory,
  createMidFlowState,
  createStateWithPendingActions,
  createRecoveryState,
  SAMPLE_LOGGERS,
  SAMPLE_ANOMALIES,
  SAMPLE_POWER_CURVE,
  extractToolCalls,
  getLastAIMessageContent,
} from './test-fixtures';
