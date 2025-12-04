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

// Mock fleet overview with all devices online (matches Python ai/tools/fleet.py structure)
// NOTE: flow-utils.executeTool wraps the result, so we return the UNWRAPPED data here
const MOCK_FLEET_HEALTHY = {
  status: {
    totalLoggers: 3,
    activeLoggers: 3,
    percentOnline: 100,
    fleetHealth: 'Healthy',
  },
  production: {
    currentTotalPowerWatts: 15000,
    todayTotalEnergyKwh: 85.2,
    siteAvgIrradiance: 800,
  },
  offlineLoggers: [],
};

// Mock fleet overview with some devices offline
const MOCK_FLEET_UNHEALTHY = {
  status: {
    totalLoggers: 3,
    activeLoggers: 2,
    percentOnline: 66.7,
    fleetHealth: 'Degraded',
  },
  production: {
    currentTotalPowerWatts: 10000,
    todayTotalEnergyKwh: 65.0,
    siteAvgIrradiance: 750,
  },
  offlineLoggers: ['926'],
};

// Mock diagnosis result (unwrapped - flow-utils.executeTool wraps it)
const MOCK_DIAGNOSIS = {
  errors: [
    {
      code: 'E201',
      description: 'Grid voltage out of range',
      count: 3,
    },
  ],
  summary: 'Found 1 error type with 3 occurrences',
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

      // Check AIMessage.tool_calls for render_ui_component
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const renderAction = toolCalls.find(
        (tc: { name: string }) => tc.name === 'render_ui_component',
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

      // Check AIMessage.tool_calls for render_ui_component
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const renderAction = toolCalls.find(
        (tc: { name: string }) => tc.name === 'render_ui_component',
      );

      expect(renderAction).toBeDefined();
      if (renderAction) {
        const args = renderAction.args as {
          props: { totalPower: number; percentOnline: number };
        };
        // totalPower is now in kW (15000W / 1000 = 15kW)
        expect(args.props.totalPower).toBe(15);
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

      // Check AIMessage.tool_calls for render_ui_component
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const renderAction = toolCalls.find(
        (tc: { name: string }) => tc.name === 'render_ui_component',
      );

      expect(renderAction).toBeDefined();
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

    it('should auto-call diagnose_error_codes when offline loggers exist', async () => {
      // Diagnosis is now auto-triggered for proactive behavior when offline devices exist
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      await graph.invoke(initialState);

      // Should call diagnose_error_codes automatically for offline loggers
      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'diagnose_error_codes',
        { logger_id: '926', days: 7 },
      );
    });

    it('should include alerts in FleetOverview props', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // Check AIMessage.tool_calls for render_ui_component
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const renderAction = toolCalls.find(
        (tc: { name: string }) => tc.name === 'render_ui_component',
      );

      expect(renderAction).toBeDefined();
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

      // Check AIMessage.tool_calls for render_ui_component
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const renderAction = toolCalls.find(
        (tc: { name: string }) => tc.name === 'render_ui_component',
      );

      expect(renderAction).toBeDefined();
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

    it('should store diagnosis result when offline loggers exist', async () => {
      // Diagnosis is auto-triggered for proactive behavior
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // Diagnosis should be stored when offline devices trigger auto-diagnosis
      expect(result.flowContext?.toolResults?.diagnosis).toBeDefined();
      expect(result.flowContext?.toolResults?.diagnosis?.status).toBe('ok');
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
          status: {
            totalLoggers: 0,
            activeLoggers: 0,
            percentOnline: 100,
            fleetHealth: 'Healthy',
          },
          production: {
            currentTotalPowerWatts: 0,
            todayTotalEnergyKwh: 0,
            siteAvgIrradiance: 0,
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
      // When tool errors, executeTool throws and catches, returning error response
      // Mock returns null to trigger error handling
      mockToolsClient = createMockToolsClient({
        get_fleet_overview: null,
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
          status: {
            totalLoggers: 4,
            activeLoggers: 3,
            percentOnline: 75,
            fleetHealth: 'Degraded',
          },
          production: {
            currentTotalPowerWatts: 10000,
            todayTotalEnergyKwh: 50,
            siteAvgIrradiance: 700,
          },
          // offlineLoggers is undefined
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
    it('should include render_ui_component in AIMessage tool_calls', async () => {
      // Note: render_ui_component is now in AIMessage.tool_calls (not pendingUiActions)
      // This avoids duplicate messages in the frontend
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // The render_ui_component is embedded in the AIMessage's tool_calls
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const hasRenderAction = toolCalls.some(
        (tc: { name: string }) => tc.name === 'render_ui_component',
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

    it('should have tool call IDs in AIMessage tool_calls', async () => {
      const graph = createMorningBriefingFlow(
        mockToolsClient as never,
        fakeModel as never,
      );

      const initialState = createTestState({ messages: [] });

      const result = await graph.invoke(initialState);

      // Check AIMessage.tool_calls for render_ui_component
      const lastMessage = result.messages[result.messages.length - 1];
      const toolCalls = (lastMessage as AIMessage).tool_calls || [];
      const renderAction = toolCalls.find(
        (tc: { name: string }) => tc.name === 'render_ui_component',
      );
      expect(renderAction?.id).toBeDefined();
      expect(renderAction?.id).toMatch(/^tool_/);
    });
  });
});
