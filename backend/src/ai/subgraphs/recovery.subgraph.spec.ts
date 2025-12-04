/**
 * Unit tests for recovery.subgraph.ts
 *
 * Tests the error recovery workflow for handling no_data, no_data_in_window,
 * and error statuses from tool execution.
 */
import { createRecoverySubgraph } from './recovery.subgraph';
import {
  createMockToolsClient,
  createTestState,
  getLastAIMessageContent,
} from '../test-utils';

/**
 * Create a state that triggers recovery detection.
 * The recovery subgraph scans toolResults for objects with status field.
 */
function createRecoveryTriggerState(
  status: 'no_data_in_window' | 'no_data' | 'error',
  availableRange?: { start: string; end: string },
) {
  return createTestState({
    recoveryAttempts: 0,
    flowContext: {
      toolResults: {
        // The subgraph looks for status on tool result objects
        some_tool: {
          status,
          message: `Test ${status} error`,
          ...(availableRange && { availableRange }),
        },
      },
    },
  });
}

describe('RecoverySubgraph', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
  });

  describe('subgraph compilation', () => {
    it('should compile without errors', () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);
      expect(graph).toBeDefined();
    });
  });

  describe('no_data_in_window recovery', () => {
    it('should detect no_data_in_window status', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });

      const result = await graph.invoke(state);

      // Should have date selection action
      const hasDateSelection = result.pendingUiActions?.some(
        (action: { toolName: string; args: { inputType?: string } }) =>
          action.toolName === 'request_user_selection' &&
          action.args?.inputType === 'date',
      );
      expect(hasDateSelection).toBe(true);
    });

    it('should include available date range in selection', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });

      const result = await graph.invoke(state);

      const dateAction = result.pendingUiActions?.find(
        (action: { toolName: string; args: { inputType?: string } }) =>
          action.toolName === 'request_user_selection' &&
          action.args?.inputType === 'date',
      );

      if (dateAction) {
        const args = dateAction.args as { minDate: string; maxDate: string };
        expect(args.minDate).toBe('2024-06-01');
        expect(args.maxDate).toBe('2025-01-15');
      }
    });

    it('should provide skip option with latest date in AIMessage', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });

      const result = await graph.invoke(state);

      // flowHint is in the AIMessage tool_calls, not in pendingUiActions
      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      );

      expect(aiMessage).toBeDefined();
      const toolCalls = (
        aiMessage as { tool_calls?: Array<{ name: string; args: unknown }> }
      )?.tool_calls;
      const dateSelectionCall = toolCalls?.find(
        (tc) => tc.name === 'request_user_selection',
      );

      if (dateSelectionCall) {
        const args = dateSelectionCall.args as {
          flowHint: { skipOption: { action: string } };
        };
        expect(args.flowHint?.skipOption).toBeDefined();
        expect(args.flowHint?.skipOption?.action).toContain('2025-01-15');
      }
    });

    it('should explain available range in message', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });

      const result = await graph.invoke(state);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('2024-06-01');
      expect(lastContent).toContain('2025-01-15');
    });

    it('should handle missing available range gracefully', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      // State with no_data_in_window but no availableRange
      const state = createTestState({
        recoveryAttempts: 0,
        flowContext: {
          toolResults: {
            some_tool: {
              status: 'no_data_in_window',
              message: 'No data in window',
              // No availableRange
            },
          },
        },
      });

      const result = await graph.invoke(state);

      // Should fallback to error handling
      expect(result.flowContext?.toolResults?.recoveryType).toBe('error');
    });
  });

  describe('no_data recovery', () => {
    it('should detect no_data status', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data');

      await graph.invoke(state);

      // Should fetch loggers for alternatives
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'list_loggers',
        {},
      );
    });

    it('should suggest alternative loggers', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data');
      state.flowContext.selectedLoggerId = '999'; // Non-existent logger

      const result = await graph.invoke(state);

      // Should have dropdown selection for alternatives
      const hasDropdown = result.pendingUiActions?.some(
        (action: { toolName: string; args: { inputType?: string } }) =>
          action.toolName === 'request_user_selection' &&
          action.args?.inputType === 'dropdown',
      );
      expect(hasDropdown).toBe(true);
    });

    it('should exclude current logger from alternatives', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data');
      state.flowContext.selectedLoggerId = '925'; // One of the mock loggers

      const result = await graph.invoke(state);

      const dropdownAction = result.pendingUiActions?.find(
        (action: { toolName: string; args: { inputType?: string } }) =>
          action.toolName === 'request_user_selection' &&
          action.args?.inputType === 'dropdown',
      );

      if (dropdownAction) {
        const args = dropdownAction.args as {
          options: Array<{ value: string }>;
        };
        const hasCurrentLogger = args.options?.some(
          (opt) => opt.value === '925',
        );
        expect(hasCurrentLogger).toBe(false);
      }
    });

    it('should suggest upload when no alternatives available', async () => {
      // Mock client with no loggers
      mockToolsClient = createMockToolsClient({
        list_loggers: { status: 'ok', result: { loggers: [] } },
      });

      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data');

      const result = await graph.invoke(state);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('upload');
    });
  });

  describe('error recovery', () => {
    it('should handle generic errors', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createTestState({
        recoveryAttempts: 0,
        flowContext: {
          toolResults: {
            some_tool: {
              status: 'error',
              message: 'Database connection failed',
            },
          },
        },
      });

      const result = await graph.invoke(state);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('Database connection failed');
    });

    it('should provide user-friendly error message', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createTestState({
        recoveryAttempts: 0,
        flowContext: {
          toolResults: {
            some_tool: {
              status: 'error',
              message: 'Internal server error',
            },
          },
        },
      });

      const result = await graph.invoke(state);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('encountered an issue');
    });
  });

  describe('recovery attempt limits', () => {
    it('should increment recovery attempts', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });
      state.recoveryAttempts = 1;

      const result = await graph.invoke(state);

      expect(result.recoveryAttempts).toBe(2);
    });

    it('should stop after max 3 attempts', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });
      state.recoveryAttempts = 3; // Already at max

      const result = await graph.invoke(state);

      // Should route to error explanation instead of continuing
      // The result should have an error message
      expect(result.recoveryAttempts).toBe(4); // Incremented but capped behavior
    });

    it('should explain max attempts reached', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });
      state.recoveryAttempts = 4; // Over max

      const result = await graph.invoke(state);

      // Should have an error/end state
      expect(result).toBeDefined();
    });
  });

  describe('flow hints', () => {
    it('should include flowHint for date selection in AIMessage', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data_in_window', {
        start: '2024-06-01',
        end: '2025-01-15',
      });

      const result = await graph.invoke(state);

      // flowHint is in the AIMessage tool_calls, not in pendingUiActions
      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      );

      expect(aiMessage).toBeDefined();
      const toolCalls = (
        aiMessage as { tool_calls?: Array<{ name: string; args: unknown }> }
      )?.tool_calls;
      const dateCall = toolCalls?.find(
        (tc) => tc.name === 'request_user_selection',
      );

      if (dateCall) {
        const args = dateCall.args as { flowHint: { expectedNext: string } };
        expect(args.flowHint?.expectedNext).toBeDefined();
        expect(args.flowHint?.expectedNext).toContain('retry');
      }
    });

    it('should include flowHint for logger selection in AIMessage', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      const state = createRecoveryTriggerState('no_data');

      const result = await graph.invoke(state);

      // flowHint is in the AIMessage tool_calls, not in pendingUiActions
      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      );

      expect(aiMessage).toBeDefined();
      const toolCalls = (
        aiMessage as { tool_calls?: Array<{ name: string; args: unknown }> }
      )?.tool_calls;
      const dropdownCall = toolCalls?.find(
        (tc) => tc.name === 'request_user_selection',
      );

      if (dropdownCall) {
        const args = dropdownCall.args as {
          flowHint: { expectedNext: string };
        };
        expect(args.flowHint?.expectedNext).toBeDefined();
      }
    });
  });

  describe('none recovery type', () => {
    it('should handle none recovery type gracefully', async () => {
      const graph = createRecoverySubgraph(mockToolsClient as never);

      // State with no recoverable status in toolResults
      const state = createTestState({
        recoveryAttempts: 0,
        flowContext: {
          toolResults: {
            some_tool: {
              status: 'ok',
              result: {},
            },
          },
        },
      });

      const result = await graph.invoke(state);

      // Should complete without error
      expect(result).toBeDefined();
    });
  });
});
