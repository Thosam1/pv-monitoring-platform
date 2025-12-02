/**
 * Unit tests for performance-audit.flow.ts
 *
 * Tests the performance audit workflow in isolation using mocked tools and fake LLM.
 */
import { createPerformanceAuditFlow } from './performance-audit.flow';
import {
  createFakeModel,
  createMockToolsClient,
  createTestState,
  createStateWithUserMessage,
  getLastAIMessageContent,
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

describe('PerformanceAuditFlow', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let fakeModel: ReturnType<typeof createFakeModel>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();

    // Mock LLM for narrative generation
    fakeModel = createFakeModel([
      new AIMessage({
        content: 'Logger 925 shows the best performance with 92.5% efficiency.',
      }),
    ]);
  });

  describe('flow compilation', () => {
    it('should compile without errors', () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );
      expect(graph).toBeDefined();
    });
  });

  describe('logger discovery', () => {
    it('should call list_loggers first', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare my loggers');

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'list_loggers',
        {},
      );
    });

    it('should store loggers in flow context', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.loggers).toBeDefined();
    });

    it('should have request_user_selection in pendingUiActions after discovery', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

      const result = await graph.invoke(initialState);

      // After discovery, it prompts for selection, which is in pendingUiActions
      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });
  });

  describe('logger selection', () => {
    it('should prompt multi-select for loggers', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

      const result = await graph.invoke(initialState);

      const selectionAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );

      expect(selectionAction).toBeDefined();
      if (selectionAction) {
        const args = selectionAction.args as { selectionType: string };
        expect(args.selectionType).toBe('multiple');
      }
    });

    it('should include skip option (top 3) in flowHint', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

      const result = await graph.invoke(initialState);

      // flowHint is in AIMessage tool_calls
      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      ) as AIMessage | undefined;

      const selectionCall = aiMessage?.tool_calls?.find(
        (tc: { name: string }) => tc.name === 'request_user_selection',
      );

      if (selectionCall) {
        const args = selectionCall.args as {
          flowHint: { skipOption: { label: string } };
        };
        expect(args.flowHint?.skipOption).toBeDefined();
        expect(args.flowHint?.skipOption?.label).toContain('top 3');
      }
    });

    it('should skip selection if already have 2+ loggers', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      await graph.invoke(initialState);

      // Should proceed to comparison, not prompt selection
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'compare_loggers',
        expect.objectContaining({ logger_ids: ['925', '926'] }),
      );
    });

    it('should END after selection (pause for user input)', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

      const result = await graph.invoke(initialState);

      // When no loggers selected, should prompt and END
      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);

      // Should NOT have compare_loggers or render_ui_component yet
      const hasCompareAction = result.pendingUiActions?.some(
        (action: { toolName: string }) => action.toolName === 'compare_loggers',
      );
      expect(hasCompareAction).toBe(false);
    });

    it('should use dropdown inputType', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

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

  describe('comparison', () => {
    it('should call compare_loggers with selected IDs', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926', 'MBMET-001'],
        },
      });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'compare_loggers',
        expect.objectContaining({
          logger_ids: ['925', '926', 'MBMET-001'],
          metric: 'power',
        }),
      );
    });

    it('should prompt for more loggers when only 1 selected', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925'], // Only 1 logger - not enough
        },
      });

      const result = await graph.invoke(initialState);

      // With only 1 logger, flow goes to 'wait' (END) after select_loggers
      // Should prompt for selection again
      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });

    it('should detect recovery needed on no_data_in_window', async () => {
      mockToolsClient = createMockToolsClient({
        compare_loggers: MOCK_NO_DATA_IN_WINDOW,
      });

      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.needsRecovery).toBe(true);
    });

    it('should store availableRange when recovery needed', async () => {
      mockToolsClient = createMockToolsClient({
        compare_loggers: MOCK_NO_DATA_IN_WINDOW,
      });

      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.availableRange).toEqual({
        start: '2024-06-01',
        end: '2025-01-15',
      });
    });
  });

  describe('chart rendering', () => {
    it('should render ComparisonChart component', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
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
        expect(args.component).toBe('ComparisonChart');
      }
    });

    it('should create series for each logger', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { series: Array<{ dataKey: string }> };
        };
        expect(args.props.series).toBeDefined();
        expect(args.props.series.length).toBe(2);
        expect(args.props.series[0].dataKey).toBe('925');
        expect(args.props.series[1].dataKey).toBe('926');
      }
    });

    it('should assign distinct colors to series', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926', 'MBMET-001'],
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { series: Array<{ color: string }> };
        };
        const colors = args.props.series.map((s) => s.color);
        // All colors should be unique
        const uniqueColors = new Set(colors);
        expect(uniqueColors.size).toBe(3);
      }
    });

    it('should include summaryStats key in props (may be undefined if not in response)', async () => {
      // Create a mock with summary data
      const mockWithSummary = createMockToolsClient({
        compare_loggers: {
          status: 'ok',
          result: {
            data: [],
            date: '2025-01-15',
            metric: 'power',
            summary: {
              '925': { average: 1695, peak: 5200, total: 285.3 },
              '926': { average: 1557, peak: 4800, total: 262.1 },
            },
          },
        },
      });

      const graph = createPerformanceAuditFlow(
        mockWithSummary as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { summaryStats: Record<string, unknown> };
        };
        expect(args.props.summaryStats).toBeDefined();
        expect(args.props.summaryStats['925']).toBeDefined();
      }
    });

    it('should generate comparison narrative', async () => {
      const narrativeModel = createFakeModel([
        new AIMessage({
          content: 'Logger 925 outperforms 926 by 4.3% in efficiency.',
        }),
      ]);

      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        narrativeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('925');
    });

    it('should use fallback narrative on LLM error', async () => {
      // FakeStreamingChatModel returns the prompt as content when no responses left
      // The flow catches the error and uses a fallback
      const errorModel = createFakeModel([]);

      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        errorModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      // Should still complete without throwing
      expect(result).toBeDefined();

      // Should have rendered the chart
      const hasRenderAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );
      expect(hasRenderAction).toBe(true);
    });

    it('should include follow-up suggestions', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
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
    it('should handle empty logger IDs array', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: [],
        },
      });

      // Should prompt selection since empty array
      const result = await graph.invoke(initialState);

      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });

    it('should handle undefined selectedLoggerIds', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {},
      });

      const result = await graph.invoke(initialState);

      const hasSelectionAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'request_user_selection',
      );
      expect(hasSelectionAction).toBe(true);
    });

    it('should handle empty loggers list', async () => {
      mockToolsClient = createMockToolsClient({
        list_loggers: { status: 'ok', result: { loggers: [] } },
      });

      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

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

    it('should handle comparison error', async () => {
      mockToolsClient = createMockToolsClient({
        compare_loggers: {
          status: 'error',
          message: 'Comparison service unavailable',
        },
      });

      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      // Should not throw
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();
    });
  });

  describe('chart configuration', () => {
    it('should set chartType to line', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { chartType: string };
        };
        expect(args.props.chartType).toBe('line');
      }
    });

    it('should set xAxisKey to timestamp', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { xAxisKey: string };
        };
        expect(args.props.xAxisKey).toBe('timestamp');
      }
    });

    it('should include title with date', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({
        messages: [],
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { title: string };
        };
        expect(args.props.title).toContain('Power Comparison');
      }
    });
  });

  describe('flowHint in AIMessage', () => {
    it('should include expectedNext in flowHint', async () => {
      const graph = createPerformanceAuditFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createStateWithUserMessage('Compare loggers');

      const result = await graph.invoke(initialState);

      const aiMessage = result.messages.find(
        (msg: { _getType: () => string }) => msg._getType() === 'ai',
      ) as AIMessage | undefined;

      const selectionCall = aiMessage?.tool_calls?.find(
        (tc: { name: string }) => tc.name === 'request_user_selection',
      );

      if (selectionCall) {
        const args = selectionCall.args as {
          flowHint: { expectedNext: string };
        };
        expect(args.flowHint?.expectedNext).toBeDefined();
        expect(args.flowHint?.expectedNext).toContain('power output');
      }
    });
  });
});
