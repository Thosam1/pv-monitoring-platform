/**
 * Unit tests for morning-briefing.flow.ts
 *
 * Tests the morning briefing workflow in isolation using mocked tools and fake LLM.
 */
import { createMorningBriefingFlow } from './morning-briefing.flow';
import {
  createFakeModel,
  createMockToolsClient,
  createTestState,
  getLastAIMessageContent,
} from '../test-utils';
import { AIMessage } from '@langchain/core/messages';

// Mock fleet overview with all devices online
const MOCK_FLEET_HEALTHY = {
  status: 'ok',
  result: {
    status: { totalPower: 15000, totalEnergy: 85.2, percentOnline: 100 },
    devices: { total: 3, online: 3, offline: 0 },
    offlineLoggers: [],
  },
};

// Mock fleet overview with some devices offline
const MOCK_FLEET_UNHEALTHY = {
  status: 'ok',
  result: {
    status: { totalPower: 10000, totalEnergy: 65.0, percentOnline: 66.7 },
    devices: { total: 3, online: 2, offline: 1 },
    offlineLoggers: ['926'],
  },
};

// Mock diagnosis result
const MOCK_DIAGNOSIS = {
  status: 'ok',
  result: {
    errors: [
      {
        code: 'E201',
        description: 'Grid voltage out of range',
        count: 3,
      },
    ],
    summary: 'Found 1 error type with 3 occurrences',
  },
};

describe('MorningBriefingFlow', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let fakeModel: ReturnType<typeof createFakeModel>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient({
      get_fleet_overview: MOCK_FLEET_HEALTHY,
    });

    // Mock LLM for narrative generation
    fakeModel = createFakeModel([
      new AIMessage({
        content:
          'Good morning! All 3 devices are online with total power output of 15kW.',
      }),
    ]);
  });

  describe('flow compilation', () => {
    it('should compile without errors', () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );
      expect(graph).toBeDefined();
    });
  });

  describe('all devices online (happy path)', () => {
    it('should call get_fleet_overview first', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'get_fleet_overview',
        {},
      );
    });

    it('should detect 100% online status', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // Should NOT call diagnose_error_codes when all devices online
      const diagnoseCalls = mockToolsClient.executeTool.mock.calls.filter(
        (call: [string, unknown]) => call[0] === 'diagnose_error_codes',
      );
      expect(diagnoseCalls.length).toBe(0);

      // Should have hasIssues = false
      expect(result.flowContext?.toolResults?.hasIssues).toBe(false);
    });

    it('should skip diagnose_issues when all online', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      await graph.invoke(initialState);

      // Verify diagnose_error_codes was NOT called
      expect(mockToolsClient.executeTool).not.toHaveBeenCalledWith(
        'diagnose_error_codes',
        expect.anything(),
      );
    });

    it('should render FleetOverview component', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // Check for render_ui_component in pending actions
      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      expect(renderAction).toBeDefined();

      if (renderAction) {
        const args = renderAction.args as { component: string };
        expect(args.component).toBe('FleetOverview');
      }
    });

    it('should include totalPower in FleetOverview props', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { totalPower: number; percentOnline: number };
        };
        expect(args.props.totalPower).toBe(15000);
        expect(args.props.percentOnline).toBe(100);
      }
    });

    it('should include positive suggestions when healthy', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

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
        // Should suggest efficiency check when healthy
        expect(
          args.suggestions.some((s) =>
            s.label.toLowerCase().includes('efficiency'),
          ),
        ).toBe(true);
      }
    });
  });

  describe('devices offline (unhealthy path)', () => {
    beforeEach(() => {
      mockToolsClient = createMockToolsClient({
        get_fleet_overview: MOCK_FLEET_UNHEALTHY,
        diagnose_error_codes: MOCK_DIAGNOSIS,
      });
    });

    it('should detect offline devices', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.hasIssues).toBe(true);
    });

    it('should call diagnose_error_codes for offline logger', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      await graph.invoke(initialState);

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'diagnose_error_codes',
        expect.objectContaining({ logger_id: '926' }),
      );
    });

    it('should include alerts in FleetOverview props', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );

      if (renderAction) {
        const args = renderAction.args as {
          props: { alerts: Array<{ type: string; message: string }> };
        };
        expect(args.props.alerts).toBeDefined();
        expect(args.props.alerts.length).toBeGreaterThan(0);
        expect(args.props.alerts[0].type).toBe('warning');
      }
    });

    it('should include issue-focused suggestions', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

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
        // Should suggest diagnose when issues found
        expect(
          args.suggestions.some((s) =>
            s.label.toLowerCase().includes('diagnose'),
          ),
        ).toBe(true);
      }
    });

    it('should store diagnosis result in context', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      expect(result.flowContext?.toolResults?.diagnosis).toBeDefined();
    });
  });

  describe('narrative generation', () => {
    it('should use LLM for narrative', async () => {
      const narrativeModel = createFakeModel([
        new AIMessage({
          content: 'All systems operational. Great solar day ahead!',
        }),
      ]);

      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        narrativeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      const lastContent = getLastAIMessageContent(result);
      expect(lastContent).toContain('operational');
    });

    it('should use fallback on LLM error', async () => {
      // Create a model that returns empty responses (will trigger fallback)
      const errorModel = createFakeModel([]);

      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        errorModel as never,
      );

      const initialState = createTestState({ messages: [] });

      // Should not throw
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();
    });

    it('should include device counts in fallback narrative', async () => {
      const errorModel = createFakeModel([]);

      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        errorModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      const lastContent = getLastAIMessageContent(result);
      // Fallback includes device info
      expect(lastContent).toContain('3');
    });
  });

  describe('edge cases', () => {
    it('should handle empty fleet response', async () => {
      mockToolsClient = createMockToolsClient({
        get_fleet_overview: {
          status: 'ok',
          result: {
            status: { totalPower: 0, totalEnergy: 0, percentOnline: 100 },
            devices: { total: 0, online: 0, offline: 0 },
          },
        },
      });

      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      // Should not throw
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();
    });

    it('should handle tool execution error', async () => {
      mockToolsClient = createMockToolsClient({
        get_fleet_overview: {
          status: 'error',
          message: 'Database connection failed',
        },
      });

      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      // Should complete without throwing
      const result = await graph.invoke(initialState);
      expect(result).toBeDefined();
    });

    it('should handle missing offline loggers array', async () => {
      mockToolsClient = createMockToolsClient({
        get_fleet_overview: {
          status: 'ok',
          result: {
            status: { totalPower: 10000, totalEnergy: 50, percentOnline: 75 },
            devices: { total: 4, online: 3, offline: 1 },
            // offlineLoggers is undefined
          },
        },
      });

      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      // Should not throw
      const result = await graph.invoke(initialState);
      expect(result.flowContext?.toolResults?.hasIssues).toBe(true);
    });
  });

  describe('pending UI actions', () => {
    it('should include render_ui_component in final pendingUiActions', async () => {
      // Note: get_fleet_overview pendingUiActions is overwritten by later nodes
      // The final pendingUiActions reflects the last node's actions
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // The final pendingUiActions comes from render_briefing node
      const hasRenderAction = result.pendingUiActions?.some(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );
      expect(hasRenderAction).toBe(true);
    });

    it('should have called get_fleet_overview tool', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      await graph.invoke(initialState);

      // Verify the tool was called even if not in final pendingUiActions
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'get_fleet_overview',
        {},
      );
    });

    it('should have tool call IDs in pendingUiActions', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      const renderAction = result.pendingUiActions?.find(
        (action: { toolName: string }) =>
          action.toolName === 'render_ui_component',
      );
      expect(renderAction?.toolCallId).toBeDefined();
      expect(renderAction?.toolCallId).toMatch(/^tool_/);
    });
  });
});
