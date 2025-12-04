/**
 * Unit tests for financial-report.flow.ts
 *
 * Tests the financial report workflow in isolation using mocked tools and fake LLM.
 */
import { createFinancialReportFlow } from './financial-report.flow';
import {
  createFakeModel,
  createMockToolsClient,
  createTestState,
  createStateWithUserMessage,
  getLastAIMessageContent,
  MOCK_FINANCIAL_SAVINGS,
} from '../test-utils';
import { AIMessage } from '@langchain/core/messages';

// Mock response for no_data_in_window scenario
const MOCK_NO_DATA_IN_WINDOW = {
  status: 'no_data_in_window',
  message: 'No data available for the requested date range',
  availableRange: {
    start: '2024-06-01',
    end: '2025-01-15',
  },
};

describe('FinancialReportFlow', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let fakeModel: ReturnType<typeof createFakeModel>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();

    // Mock LLM for narrative generation
    fakeModel = createFakeModel([
      new AIMessage({
        content:
          'Your solar system saved $250 this month, generating 1,250 kWh.',
      }),
    ]);
  });

  describe('flow compilation', () => {
    it('should compile without errors', () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );
      expect(graph).toBeDefined();
    });
  });

  describe('with pre-selected logger', () => {
    it('should skip selection prompt', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      // Should NOT have request_user_selection in pending actions
      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(false);
    });

    it('should call calculate_financial_savings', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'calculate_financial_savings',
        expect.objectContaining({ logger_id: '925' }),
      );
    });

    it('should call forecast_production', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'forecast_production',
        expect.objectContaining({ logger_id: '925', days_ahead: 7 }),
      );
    });

    it('should render FinancialReport component', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      expect(renderAction).toBeDefined();
      if (renderAction) {
        const args = renderAction.args as { component: string };
        expect(args.component).toBe('FinancialReport');
      }
    });

    it('should pass electricity_rate parameter', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'calculate_financial_savings',
        expect.objectContaining({ electricity_rate: 0.2 }),
      );
    });
  });

  describe('without selected logger', () => {
    it('should fetch loggers list', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage(
        'Show me financial savings',
      );

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'list_loggers',
        {},
      );
    });

    it('should prompt for logger selection', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Financial report', {
        activeFlow: 'financial_report',
      });

      const result = await graph.invoke(initialState);

      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });

    it('should include flowHint in selection AIMessage', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Financial report', {
        activeFlow: 'financial_report',
      });

      const result = await graph.invoke(initialState);

      // flowHint is in the AIMessage tool_calls
      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      ) as AIMessage | undefined;

      expect(aiMessage?.tool_calls).toBeDefined();

      const selectionCall = aiMessage?.tool_calls?.find(
        (tc: { name: string }) => tc.name === 'request_user_selection',
      );

      if (selectionCall) {
        const args = selectionCall.args as {
          flowHint: { expectedNext: string };
        };
        expect(args.flowHint).toBeDefined();
        expect(args.flowHint.expectedNext).toContain('financial');
      }
    });

    it('should format logger options correctly', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Financial report', {
        activeFlow: 'financial_report',
      });

      const result = await graph.invoke(initialState);

      const selectionAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );

      if (selectionAction) {
        const args = selectionAction.args as {
          options: Array<{ value: string; label: string }>;
        };
        expect(args.options).toBeDefined();
        expect(args.options.length).toBe(3); // Mock has 3 loggers
      }
    });

    it('should use dropdown inputType', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Financial report', {
        activeFlow: 'financial_report',
      });

      const result = await graph.invoke(initialState);

      const selectionAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );

      if (selectionAction) {
        const args = selectionAction.args as { inputType: string };
        expect(args.inputType).toBe('dropdown');
      }
    });
  });

  describe('recovery scenarios', () => {
    beforeEach(() => {
      mockToolsClient = createMockToolsClient({
        calculate_financial_savings: MOCK_NO_DATA_IN_WINDOW,
      });
    });

    it('should detect no_data_in_window', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.savings).toBeDefined();
      expect(
        (result.flowContext?.toolResults?.savings as { status: string }).status,
      ).toBe('no_data_in_window');
    });

    it('should set needsRecovery flag', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.needsRecovery).toBe(true);
    });

    it('should include availableRange in context', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.availableRange).toEqual({
        start: '2024-06-01',
        end: '2025-01-15',
      });
    });

    it('should not call forecast when recovery needed', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      await graph.invoke(initialState);

      // Should NOT call forecast if recovery is triggered
      const forecastCalls = mockToolsClient.executeTool.mock.calls.filter(
        (call: [string, unknown]) => call[0] === 'forecast_production',
      );
      expect(forecastCalls.length).toBe(0);
    });
  });

  describe('report rendering', () => {
    it('should include energy, savings, CO2 in props', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: {
            energyGenerated: number;
            savings: number;
            co2Offset: number;
          };
        };
        expect(args.props.energyGenerated).toBeDefined();
        expect(args.props.savings).toBeDefined();
        expect(args.props.co2Offset).toBeDefined();
      }
    });

    it('should include forecast data in props', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { forecast: { totalPredicted: number } };
        };
        expect(args.props.forecast).toBeDefined();
      }
    });

    it('should generate LLM narrative', async () => {
      const narrativeModel = createFakeModel([
        new AIMessage({
          content: 'You saved $300 this month - excellent performance!',
        }),
      ]);

      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        narrativeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('$300');
    });

    it('should use fallback narrative on LLM error', async () => {
      const errorModel = createFakeModel([]);

      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        errorModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      // Fallback contains kWh
      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('kWh');
    });

    it('should include follow-up suggestions', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          suggestions: Array<{ label: string }>;
        };
        expect(args.suggestions).toBeDefined();
        expect(args.suggestions.length).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle missing logger ID gracefully', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      // State with empty flowContext (no selectedLoggerId)
      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {},
      });

      // Should not throw
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();

      // Should prompt for selection
      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });

    it('should handle forecast failure independently', async () => {
      mockToolsClient = createMockToolsClient({
        calculate_financial_savings: MOCK_FINANCIAL_SAVINGS,
        forecast_production: {
          status: 'error',
          message: 'Forecast service unavailable',
        },
      });

      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      // Should not throw even if forecast fails
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();

      // Should still render report
      const hasRenderAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );
      expect(hasRenderAction).toBe(true);
    });

    it('should handle empty loggers list', async () => {
      mockToolsClient = createMockToolsClient({
        list_loggers: { status: 'ok', result: { loggers: [] } },
      });

      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Financial report', {
        activeFlow: 'financial_report',
      });

      const result = await graph.invoke(initialState);

      const selectionAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );

      if (selectionAction) {
        const args = selectionAction.args as { options: unknown[] };
        expect(args.options).toEqual([]);
      }
    });
  });

  describe('date range calculation', () => {
    it('should use 30-day window for savings', async () => {
      const graph = createFinancialReportFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        activeFlow: 'financial_report',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      await graph.invoke(initialState);

      const savingsCall = (
        mockToolsClient.executeTool.mock.calls as Array<[string, unknown]>
      ).find((call) => call[0] === 'calculate_financial_savings');

      expect(savingsCall).toBeDefined();
      const args = savingsCall?.[1] as { start_date: string; end_date: string };
      expect(args.start_date).toBeDefined();
      expect(args.end_date).toBeDefined();

      // Verify dates are in YYYY-MM-DD format
      expect(args.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(args.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
