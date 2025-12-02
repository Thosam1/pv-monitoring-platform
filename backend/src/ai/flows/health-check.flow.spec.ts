/**
 * Unit tests for health-check.flow.ts
 *
 * Tests the health check workflow in isolation using mocked tools and fake LLM.
 */
import { createHealthCheckFlow } from './health-check.flow';
import {
  createFakeModel,
  createMockToolsClient,
  createTestState,
  createStateWithUserMessage,
  MOCK_HEALTH_CLEAN,
  MOCK_NO_DATA_IN_WINDOW,
  getLastAIMessageContent,
} from '../test-utils';
import { AIMessage } from '@langchain/core/messages';

describe('HealthCheckFlow', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let fakeModel: ReturnType<typeof createFakeModel>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
    // Mock LLM for narrative generation
    fakeModel = createFakeModel([
      new AIMessage({
        content:
          'Health check complete. Found 2 anomalies requiring attention.',
      }),
    ]);
  });

  describe('flow compilation', () => {
    it('should compile without errors', () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );
      expect(graph).toBeDefined();
    });
  });

  describe('with selected logger', () => {
    it('should analyze health when logger is pre-selected', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      await graph.invoke(initialState);

      // Should call analyze_inverter_health with the selected logger
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'analyze_inverter_health',
        expect.objectContaining({ logger_id: '925' }),
      );
    });

    it('should render HealthReport component', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      // Check for render_ui_component in pending actions
      const hasRenderAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );
      expect(hasRenderAction).toBe(true);
    });

    it('should include anomalies in report props', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      // Check that render args include anomalies
      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          component: string;
          props: { anomalies: unknown[] };
        };
        expect(args.component).toBe('HealthReport');
        expect(args.props.anomalies).toBeDefined();
      }
    });
  });

  describe('without selected logger', () => {
    it('should fetch loggers list first', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage(
        'Check health of my inverter',
      );

      await graph.invoke(initialState);

      // Should call list_loggers first
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'list_loggers',
        {},
      );
    });

    it('should prompt for logger selection', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Check health');

      const result = await graph.invoke(initialState);

      // Should have request_user_selection in pending actions
      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });

    it('should format logger options correctly', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Check health');

      const result = await graph.invoke(initialState);

      const selectionAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );

      expect(selectionAction).toBeDefined();
      if (selectionAction) {
        const args = selectionAction.args as {
          options: Array<{ value: string }>;
        };
        expect(args.options).toBeDefined();
        // Mock has 3 loggers
        expect(args.options.length).toBe(3);
      }
    });
  });

  describe('all devices analysis', () => {
    it('should detect "all devices" intent', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage(
        'Check health of all devices',
      );

      await graph.invoke(initialState);

      // Should call list_loggers to get all devices
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'list_loggers',
        {},
      );

      // Should call analyze_inverter_health for each logger (3 loggers in mock)
      const healthCalls = mockToolsClient.executeTool.mock.calls.filter(
        (call: [string, unknown]) => call[0] === 'analyze_inverter_health',
      );
      // All 3 mock loggers should be analyzed
      expect(healthCalls.length).toBe(3);
    });

    it('should render FleetHealthReport for all devices', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Check all my inverters');

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as { component: string };
        expect(args.component).toBe('FleetHealthReport');
      }
    });
  });

  describe('recovery triggering', () => {
    it('should set needsRecovery on no_data_in_window', async () => {
      // Override mock to return no_data_in_window
      mockToolsClient = createMockToolsClient({
        analyze_inverter_health: MOCK_NO_DATA_IN_WINDOW,
      });

      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.needsRecovery).toBe(true);
      expect(result.flowContext?.toolResults?.availableRange).toBeDefined();
    });
  });

  describe('clean health results', () => {
    it('should handle system with no anomalies', async () => {
      mockToolsClient = createMockToolsClient({
        analyze_inverter_health: MOCK_HEALTH_CLEAN,
      });

      // Use a model that returns a clean health message
      const cleanModel = createFakeModel([
        new AIMessage({
          content:
            'All systems healthy! No anomalies detected in the past 7 days.',
        }),
      ]);

      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        cleanModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      // Should still render HealthReport with empty anomalies
      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { healthScore: number; anomalies: unknown[] };
        };
        expect(args.props.healthScore).toBe(100);
        expect(args.props.anomalies).toHaveLength(0);
      }
    });
  });

  describe('narrative generation', () => {
    it('should generate narrative with LLM', async () => {
      const narrativeModel = createFakeModel([
        new AIMessage({
          content:
            'System health analysis shows 2 critical anomalies requiring immediate attention.',
        }),
      ]);

      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        narrativeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      const result = await graph.invoke(initialState);

      // Check that narrative was generated
      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('anomalies');
    });

    it('should use fallback narrative on LLM error', async () => {
      const errorModel = createFakeModel([]);
      // Force model to fail by making responses empty

      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        errorModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      // Should not throw, should use fallback
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();
    });
  });

  describe('flow hint generation', () => {
    it('should include flowHint in AIMessage tool_calls', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Check health');

      const result = await graph.invoke(initialState);

      // Find the AIMessage with tool_calls (flowHint is in the AIMessage, not pendingUiActions)
      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      ) as AIMessage | undefined;

      expect(aiMessage).toBeDefined();
      expect(aiMessage?.tool_calls).toBeDefined();
      expect(aiMessage?.tool_calls?.length).toBeGreaterThan(0);

      const selectionCall = aiMessage?.tool_calls?.find(
        (tc: { name: string }) => tc.name === 'request_user_selection',
      );
      expect(selectionCall).toBeDefined();

      if (selectionCall) {
        const args = selectionCall.args as {
          flowHint: { expectedNext: string };
        };
        expect(args.flowHint).toBeDefined();
        expect(args.flowHint.expectedNext).toContain('7 days');
      }
    });
  });

  describe('suggestions generation', () => {
    it('should include follow-up suggestions', async () => {
      const graph = createHealthCheckFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
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
});
