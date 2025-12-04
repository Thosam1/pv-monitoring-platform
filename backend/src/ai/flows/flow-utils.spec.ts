/**
 * Unit tests for flow-utils.ts
 *
 * Tests utility functions used across all explicit flows.
 */
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  executeTool,
  createToolCallMessage,
  createToolResultMessage,
  createRenderArgs,
  createSelectionArgs,
  generateToolCallId,
  shouldTriggerRecovery,
  extractAvailableRange,
  mergeFlowContext,
  getLatestDateString,
  getDateDaysAgo,
  formatLoggerOptions,
  getLastUserMessage,
  matchesAllDevicesIntent,
  COMMON_SUGGESTIONS,
  contextToSuggestions,
  extractContextFromResult,
  generateDynamicSuggestions,
  ContextEnvelope,
  computeBestPerformer,
  computeWorstPerformer,
  computeSpreadPercent,
  computeComparisonSeverity,
  parseNaturalDateRange,
  resolveLoggersByPattern,
  isMeteoLogger,
  isInverterLogger,
  createEnhancedSelectionArgs,
  EnhancedSelectionConfig,
  getOverallDataRange,
  LoggerInfo,
  mapColorSchemeToStyle,
  mapComponentHint,
  mapHintToChartType,
} from './flow-utils';
import { createMockToolsClient } from '../test-utils';

describe('FlowUtils', () => {
  describe('executeTool', () => {
    it('should call httpClient.executeTool with correct args', async () => {
      const mockClient = createMockToolsClient();

      await executeTool(mockClient as never, 'list_loggers', { some: 'arg' });

      expect(mockClient.executeTool).toHaveBeenCalledWith('list_loggers', {
        some: 'arg',
      });
    });

    it('should return result on success', async () => {
      const mockClient = createMockToolsClient();

      const result = await executeTool(mockClient as never, 'list_loggers', {});

      expect(result.status).toBe('ok');
      expect(result.result).toBeDefined();
    });

    it('should return error status on exception', async () => {
      const mockClient = createMockToolsClient();
      mockClient.executeTool.mockRejectedValueOnce(new Error('Network error'));

      const result = await executeTool(mockClient as never, 'list_loggers', {});

      expect(result.status).toBe('error');
      expect(result.message).toContain('Network error');
    });
  });

  describe('createToolCallMessage', () => {
    it('should create AIMessage with tool_calls', () => {
      const message = createToolCallMessage('call_123', 'list_loggers', {
        foo: 'bar',
      });

      expect(message).toBeInstanceOf(AIMessage);
      expect(message.tool_calls).toBeDefined();
      expect(message.tool_calls?.length).toBe(1);
    });

    it('should include correct id, name, args', () => {
      const message = createToolCallMessage('call_456', 'get_power_curve', {
        logger_id: '925',
      });

      const toolCall = message.tool_calls?.[0];
      expect(toolCall?.id).toBe('call_456');
      expect(toolCall?.name).toBe('get_power_curve');
      expect(toolCall?.args).toEqual({ logger_id: '925' });
    });

    it('should set empty content', () => {
      const message = createToolCallMessage('call_789', 'test', {});

      expect(message.content).toBe('');
    });
  });

  describe('createToolResultMessage', () => {
    it('should create ToolMessage', () => {
      const message = createToolResultMessage('call_123', 'list_loggers', {
        loggers: [],
      });

      expect(message._getType()).toBe('tool');
    });

    it('should stringify result as content', () => {
      const result = { loggers: [{ id: '925' }] };
      const message = createToolResultMessage(
        'call_123',
        'list_loggers',
        result,
      );

      expect(message.content).toBe(JSON.stringify(result));
    });

    it('should include tool_call_id', () => {
      const message = createToolResultMessage('call_abc', 'test', {});

      expect(message.tool_call_id).toBe('call_abc');
    });
  });

  describe('createRenderArgs', () => {
    it('should include component name', () => {
      const args = createRenderArgs('FleetOverview', {});

      expect(args.component).toBe('FleetOverview');
    });

    it('should include props', () => {
      const props = { totalPower: 5000, deviceCount: 3 };
      const args = createRenderArgs('FleetOverview', props);

      expect(args.props).toEqual(props);
    });

    it('should include suggestions', () => {
      const suggestions = [
        { label: 'Test', action: 'Do test', priority: 'primary' as const },
      ];
      const args = createRenderArgs('FleetOverview', {}, suggestions);

      expect(args.suggestions).toEqual(suggestions);
    });

    it('should default to empty suggestions', () => {
      const args = createRenderArgs('FleetOverview', {});

      expect(args.suggestions).toEqual([]);
    });
  });

  describe('createSelectionArgs', () => {
    it('should include prompt and options', () => {
      const options = [{ value: '925', label: 'Logger 925' }];
      const args = createSelectionArgs({
        prompt: 'Select a logger:',
        options,
      });

      expect(args.prompt).toBe('Select a logger:');
      expect(args.options).toEqual(options);
    });

    it('should default selectionType to single', () => {
      const args = createSelectionArgs({
        prompt: 'Select:',
        options: [],
      });

      expect(args.selectionType).toBe('single');
    });

    it('should default inputType to dropdown', () => {
      const args = createSelectionArgs({
        prompt: 'Select:',
        options: [],
      });

      expect(args.inputType).toBe('dropdown');
    });

    it('should include flowHint when provided', () => {
      const flowHint = {
        expectedNext: 'Will analyze health',
        skipOption: { label: 'Skip', action: 'Use default' },
      };
      const args = createSelectionArgs({
        prompt: 'Select:',
        options: [],
        flowHint,
      });

      expect(args.flowHint).toEqual(flowHint);
    });

    it('should include date range when provided', () => {
      const args = createSelectionArgs({
        prompt: 'Select date:',
        options: [],
        inputType: 'date',
        minDate: '2024-01-01',
        maxDate: '2025-01-15',
      });

      expect(args.minDate).toBe('2024-01-01');
      expect(args.maxDate).toBe('2025-01-15');
    });

    it('should support multiple selection type', () => {
      const args = createSelectionArgs({
        prompt: 'Select loggers:',
        options: [],
        selectionType: 'multiple',
      });

      expect(args.selectionType).toBe('multiple');
    });
  });

  describe('generateToolCallId', () => {
    it('should return unique IDs', () => {
      const id1 = generateToolCallId();
      const id2 = generateToolCallId();

      expect(id1).not.toBe(id2);
    });

    it('should have correct format (tool_ prefix with UUID)', () => {
      const id = generateToolCallId();

      // UUID format: tool_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      expect(id).toMatch(
        /^tool_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });
  });

  describe('shouldTriggerRecovery', () => {
    it('should return true for no_data_in_window', () => {
      expect(shouldTriggerRecovery({ status: 'no_data_in_window' })).toBe(true);
    });

    it('should return true for no_data', () => {
      expect(shouldTriggerRecovery({ status: 'no_data' })).toBe(true);
    });

    it('should return false for ok', () => {
      expect(shouldTriggerRecovery({ status: 'ok', result: {} })).toBe(false);
    });

    it('should return false for error', () => {
      expect(
        shouldTriggerRecovery({ status: 'error', message: 'Failed' }),
      ).toBe(false);
    });

    it('should return false for success', () => {
      expect(shouldTriggerRecovery({ status: 'success', result: {} })).toBe(
        false,
      );
    });
  });

  describe('extractAvailableRange', () => {
    it('should extract range from no_data_in_window', () => {
      const response = {
        status: 'no_data_in_window' as const,
        availableRange: { start: '2024-06-01', end: '2025-01-15' },
      };

      const range = extractAvailableRange(response);

      expect(range).toEqual({ start: '2024-06-01', end: '2025-01-15' });
    });

    it('should return null for ok status', () => {
      const response = { status: 'ok' as const, result: {} };

      const range = extractAvailableRange(response);

      expect(range).toBeNull();
    });

    it('should return null for no_data status', () => {
      const response = { status: 'no_data' as const };

      const range = extractAvailableRange(response);

      expect(range).toBeNull();
    });

    it('should return null if no availableRange', () => {
      const response = { status: 'no_data_in_window' as const };

      const range = extractAvailableRange(response);

      expect(range).toBeNull();
    });
  });

  describe('mergeFlowContext', () => {
    it('should merge top-level properties', () => {
      const existing = { selectedLoggerId: '925' };
      const updates = { selectedDate: '2025-01-15' };

      const merged = mergeFlowContext(existing, updates);

      expect(merged.selectedLoggerId).toBe('925');
      expect(merged.selectedDate).toBe('2025-01-15');
    });

    it('should deep merge toolResults', () => {
      const existing = {
        toolResults: { fleet_overview: { status: 'ok' } },
      };
      const updates = {
        toolResults: { health_check: { status: 'ok' } },
      };

      const merged = mergeFlowContext(existing, updates);

      expect(merged.toolResults?.fleet_overview).toEqual({ status: 'ok' });
      expect(merged.toolResults?.health_check).toEqual({ status: 'ok' });
    });

    it('should override existing toolResults values', () => {
      const existing = {
        toolResults: { fleet_overview: { status: 'pending' } },
      };
      const updates = {
        toolResults: { fleet_overview: { status: 'ok', data: {} } },
      };

      const merged = mergeFlowContext(existing, updates);

      expect(merged.toolResults?.fleet_overview).toEqual({
        status: 'ok',
        data: {},
      });
    });
  });

  describe('date utilities', () => {
    describe('getLatestDateString', () => {
      it('should return YYYY-MM-DD format', () => {
        const dateStr = getLatestDateString();

        expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });

      it("should return today's date", () => {
        const today = new Date().toISOString().split('T')[0];
        const dateStr = getLatestDateString();

        expect(dateStr).toBe(today);
      });
    });

    describe('getDateDaysAgo', () => {
      it('should calculate correctly for 7 days', () => {
        const sevenDaysAgo = getDateDaysAgo(7);
        const expected = new Date();
        expected.setDate(expected.getDate() - 7);

        expect(sevenDaysAgo).toBe(expected.toISOString().split('T')[0]);
      });

      it('should calculate correctly for 30 days', () => {
        const thirtyDaysAgo = getDateDaysAgo(30);
        const expected = new Date();
        expected.setDate(expected.getDate() - 30);

        expect(thirtyDaysAgo).toBe(expected.toISOString().split('T')[0]);
      });

      it('should return YYYY-MM-DD format', () => {
        const dateStr = getDateDaysAgo(5);

        expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('formatLoggerOptions', () => {
    it('should format loggers with all fields', () => {
      const loggersResult = {
        loggers: [
          {
            loggerId: '925',
            loggerType: 'goodwe',
            dataRange: {
              earliestData: '2024-06-01T00:00:00Z',
              latestData: '2025-01-15T23:45:00Z',
            },
          },
        ],
      };

      const options = formatLoggerOptions(loggersResult);

      expect(options).toHaveLength(1);
      expect(options[0].value).toBe('925');
      expect(options[0].label).toBe('925');
      expect(options[0].group).toBe('goodwe');
      expect(options[0].subtitle).toContain('2024-06-01');
    });

    it('should handle missing dataRange', () => {
      const loggersResult = {
        loggers: [{ loggerId: '926', loggerType: 'lti' }],
      };

      const options = formatLoggerOptions(loggersResult);

      expect(options[0].subtitle).toBe('No data range available');
    });

    it('should return empty array for no loggers', () => {
      const options = formatLoggerOptions({ loggers: [] });

      expect(options).toEqual([]);
    });

    it('should return empty array for undefined loggers', () => {
      const options = formatLoggerOptions({});

      expect(options).toEqual([]);
    });
  });

  describe('getLastUserMessage', () => {
    it('should find last HumanMessage', () => {
      const messages = [
        new HumanMessage('First'),
        new AIMessage('Response'),
        new HumanMessage('Second'),
      ];

      const lastMsg = getLastUserMessage(messages);

      expect(lastMsg).toBe('Second');
    });

    it('should handle string content', () => {
      const messages = [new HumanMessage('Simple string content')];

      const lastMsg = getLastUserMessage(messages);

      expect(lastMsg).toBe('Simple string content');
    });

    it('should handle array content', () => {
      const messages = [
        new HumanMessage({
          content: [
            { type: 'text', text: 'Part one' },
            { type: 'text', text: 'Part two' },
          ],
        }),
      ];

      const lastMsg = getLastUserMessage(messages);

      expect(lastMsg).toContain('Part one');
      expect(lastMsg).toContain('Part two');
    });

    it('should return empty string if no user message', () => {
      const messages = [new AIMessage('Only AI message')];

      const lastMsg = getLastUserMessage(messages);

      expect(lastMsg).toBe('');
    });

    it('should return empty string for empty messages array', () => {
      const lastMsg = getLastUserMessage([]);

      expect(lastMsg).toBe('');
    });
  });

  describe('matchesAllDevicesIntent', () => {
    it('should match "all devices"', () => {
      expect(matchesAllDevicesIntent('Check all devices')).toBe(true);
    });

    it('should match "all loggers"', () => {
      expect(matchesAllDevicesIntent('Show all loggers')).toBe(true);
    });

    it('should match "all inverters"', () => {
      expect(matchesAllDevicesIntent('Check all inverters')).toBe(true);
    });

    it('should match "fleet"', () => {
      expect(matchesAllDevicesIntent('Show fleet status')).toBe(true);
    });

    it('should match "every device"', () => {
      expect(matchesAllDevicesIntent('Check every device')).toBe(true);
    });

    it('should match "each logger"', () => {
      expect(matchesAllDevicesIntent('Analyze each logger')).toBe(true);
    });

    it('should not match "one device"', () => {
      expect(matchesAllDevicesIntent('Check one device')).toBe(false);
    });

    it('should not match "logger 925"', () => {
      expect(matchesAllDevicesIntent('Check logger 925')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(matchesAllDevicesIntent('ALL DEVICES')).toBe(true);
      expect(matchesAllDevicesIntent('All Loggers')).toBe(true);
    });
  });

  describe('COMMON_SUGGESTIONS', () => {
    describe('afterFleetOverview', () => {
      it('should return issue suggestions when hasIssues is true', () => {
        const suggestions = COMMON_SUGGESTIONS.afterFleetOverview(true);

        expect(
          suggestions.some((s) => s.label.toLowerCase().includes('diagnose')),
        ).toBe(true);
      });

      it('should return efficiency suggestions when hasIssues is false', () => {
        const suggestions = COMMON_SUGGESTIONS.afterFleetOverview(false);

        expect(
          suggestions.some((s) => s.label.toLowerCase().includes('efficiency')),
        ).toBe(true);
      });

      it('should return non-empty array', () => {
        expect(
          COMMON_SUGGESTIONS.afterFleetOverview(true).length,
        ).toBeGreaterThan(0);
        expect(
          COMMON_SUGGESTIONS.afterFleetOverview(false).length,
        ).toBeGreaterThan(0);
      });
    });

    describe('afterFinancialReport', () => {
      it('should return forecast suggestions', () => {
        const suggestions = COMMON_SUGGESTIONS.afterFinancialReport();

        expect(
          suggestions.some((s) => s.label.toLowerCase().includes('forecast')),
        ).toBe(true);
      });

      it('should return non-empty array', () => {
        expect(
          COMMON_SUGGESTIONS.afterFinancialReport().length,
        ).toBeGreaterThan(0);
      });
    });

    describe('afterComparison', () => {
      it('should return energy/health suggestions', () => {
        const suggestions = COMMON_SUGGESTIONS.afterComparison();

        expect(suggestions.length).toBeGreaterThan(0);
      });
    });

    describe('afterHealthCheck', () => {
      it('should return power curve suggestions when hasAnomalies is true', () => {
        const suggestions = COMMON_SUGGESTIONS.afterHealthCheck(true);

        expect(
          suggestions.some((s) => s.label.toLowerCase().includes('power')),
        ).toBe(true);
      });

      it('should return efficiency suggestions when hasAnomalies is false', () => {
        const suggestions = COMMON_SUGGESTIONS.afterHealthCheck(false);

        expect(
          suggestions.some((s) => s.label.toLowerCase().includes('efficiency')),
        ).toBe(true);
      });
    });
  });

  // ============================================================
  // Context Envelope Tests
  // ============================================================

  describe('contextToSuggestions', () => {
    it('should convert next_steps to EnhancedSuggestion array', () => {
      const context: ContextEnvelope = {
        summary: 'Test summary',
        insights: [],
        next_steps: [
          {
            priority: 'urgent',
            action: 'Check system health immediately',
            reason: 'Critical errors detected',
            tool_hint: 'analyze_inverter_health',
          },
          {
            priority: 'suggested',
            action: 'View power curve',
            reason: 'See production patterns',
            tool_hint: 'get_power_curve',
          },
        ],
      };

      const suggestions = contextToSuggestions(context);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].priority).toBe('urgent');
      expect(suggestions[0].action).toBe('Check system health immediately');
      expect(suggestions[0].reason).toBe('Critical errors detected');
      expect(suggestions[0].badge).toBe('!');
      expect(suggestions[0].icon).toBe('alert');
    });

    it('should truncate long action labels', () => {
      const context: ContextEnvelope = {
        summary: 'Test',
        insights: [],
        next_steps: [
          {
            priority: 'suggested',
            action: 'This is a very long action that should be truncated',
            reason: 'Test reason',
          },
        ],
      };

      const suggestions = contextToSuggestions(context);

      expect(suggestions[0].label).toBe('This is a very...');
      expect(suggestions[0].action).toBe(
        'This is a very long action that should be truncated',
      );
    });

    it('should return empty array for undefined context', () => {
      const suggestions = contextToSuggestions(undefined);

      expect(suggestions).toEqual([]);
    });

    it('should return empty array for context without next_steps', () => {
      const context: ContextEnvelope = {
        summary: 'Test',
        insights: [],
        next_steps: [],
      };

      const suggestions = contextToSuggestions(context);

      expect(suggestions).toEqual([]);
    });

    it('should map priority to correct badge', () => {
      const context: ContextEnvelope = {
        summary: 'Test',
        insights: [],
        next_steps: [
          { priority: 'urgent', action: 'Urgent action', reason: 'Urgent' },
          {
            priority: 'recommended',
            action: 'Recommended action',
            reason: 'Recommended',
          },
          {
            priority: 'suggested',
            action: 'Suggested action',
            reason: 'Suggested',
          },
          {
            priority: 'optional',
            action: 'Optional action',
            reason: 'Optional',
          },
        ],
      };

      const suggestions = contextToSuggestions(context);

      expect(suggestions[0].badge).toBe('!');
      expect(suggestions[1].badge).toBe('*');
      expect(suggestions[2].badge).toBe('>');
      expect(suggestions[3].badge).toBeNull();
    });

    it('should map tool hints to correct icons', () => {
      const context: ContextEnvelope = {
        summary: 'Test',
        insights: [],
        next_steps: [
          {
            priority: 'suggested',
            action: 'Check errors',
            reason: 'Test',
            tool_hint: 'diagnose_error_codes',
          },
          {
            priority: 'suggested',
            action: 'Calculate savings',
            reason: 'Test',
            tool_hint: 'calculate_financial_savings',
          },
          {
            priority: 'suggested',
            action: 'Forecast production',
            reason: 'Test',
            tool_hint: 'forecast_production',
          },
          {
            priority: 'suggested',
            action: 'Compare loggers',
            reason: 'Test',
            tool_hint: 'compare_loggers',
          },
        ],
      };

      const suggestions = contextToSuggestions(context);

      expect(suggestions[0].icon).toBe('alert');
      expect(suggestions[1].icon).toBe('dollar');
      expect(suggestions[2].icon).toBe('lightbulb');
      expect(suggestions[3].icon).toBe('chart');
    });

    it('should include params from next_steps', () => {
      const context: ContextEnvelope = {
        summary: 'Test',
        insights: [],
        next_steps: [
          {
            priority: 'suggested',
            action: 'View power curve',
            reason: 'Test',
            tool_hint: 'get_power_curve',
            params: { logger_id: '925', date: '2025-01-15' },
          },
        ],
      };

      const suggestions = contextToSuggestions(context);

      expect(suggestions[0].params).toEqual({
        logger_id: '925',
        date: '2025-01-15',
      });
    });
  });

  describe('extractContextFromResult', () => {
    it('should extract context from nested result', () => {
      const toolResponse = {
        status: 'ok' as const,
        result: {
          loggerId: '925',
          data: [],
          context: {
            summary: 'Test summary',
            insights: [],
            next_steps: [],
          },
        },
      };

      const context = extractContextFromResult(toolResponse);

      expect(context).toBeDefined();
      expect(context?.summary).toBe('Test summary');
    });

    it('should return undefined when no context in result', () => {
      const toolResponse = {
        status: 'ok' as const,
        result: {
          loggerId: '925',
          data: [],
        },
      };

      const context = extractContextFromResult(toolResponse);

      expect(context).toBeUndefined();
    });

    it('should return undefined when result is undefined', () => {
      const toolResponse = {
        status: 'ok' as const,
      };

      const context = extractContextFromResult(toolResponse);

      expect(context).toBeUndefined();
    });

    it('should handle complex context with all fields', () => {
      const toolResponse = {
        status: 'ok' as const,
        result: {
          context: {
            summary: 'Full context test',
            insights: [
              {
                type: 'performance',
                severity: 'warning',
                title: 'Low efficiency',
                description: 'System operating below capacity',
                metric: '72%',
                benchmark: 'vs 85% typical',
              },
            ],
            next_steps: [
              {
                priority: 'recommended',
                action: 'Investigate',
                reason: 'Performance issue detected',
              },
            ],
            ui_suggestion: {
              preferred_component: 'chart_composed',
              display_mode: 'detailed',
              color_scheme: 'warning',
            },
            alert: 'Attention required',
          },
        },
      };

      const context = extractContextFromResult(toolResponse);

      expect(context?.summary).toBe('Full context test');
      expect(context?.insights).toHaveLength(1);
      expect(context?.insights[0].severity).toBe('warning');
      expect(context?.next_steps).toHaveLength(1);
      expect(context?.ui_suggestion?.color_scheme).toBe('warning');
      expect(context?.alert).toBe('Attention required');
    });
  });

  describe('generateDynamicSuggestions', () => {
    it('should use context from tool response when available', () => {
      const result = {
        status: 'ok' as const,
        result: {
          context: {
            summary: 'Test',
            insights: [],
            next_steps: [
              {
                priority: 'urgent',
                action: 'From context',
                reason: 'Context-based',
                tool_hint: 'analyze_inverter_health',
              },
            ],
          },
        },
      };

      const suggestions = generateDynamicSuggestions('get_power_curve', result);

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].action).toBe('From context');
      expect(suggestions[0].priority).toBe('urgent');
    });

    it('should generate fleet overview suggestions when no context', () => {
      const result = {
        status: 'ok' as const,
        result: {
          status: { percentOnline: 80 },
          devices: { offline: 2 },
        },
      };

      const suggestions = generateDynamicSuggestions(
        'get_fleet_overview',
        result,
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(
        suggestions.some(
          (s) =>
            s.priority === 'urgent' || s.action.toLowerCase().includes('issue'),
        ),
      ).toBe(true);
    });

    it('should generate financial suggestions when no context', () => {
      const result = {
        status: 'ok' as const,
        result: {
          savingsUsd: 150.5,
          period: { start: '2025-01-01', end: '2025-01-15' },
        },
      };

      const suggestions = generateDynamicSuggestions(
        'calculate_financial_savings',
        result,
      );

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should generate health check suggestions based on anomalies', () => {
      const resultWithAnomalies = {
        status: 'ok' as const,
        result: {
          anomalyCount: 5,
          loggerId: '925',
        },
      };

      const suggestions = generateDynamicSuggestions(
        'analyze_inverter_health',
        resultWithAnomalies,
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(
        suggestions.some(
          (s) =>
            s.priority === 'urgent' ||
            s.action.toLowerCase().includes('diagnose'),
        ),
      ).toBe(true);
    });

    it('should generate performance suggestions based on status', () => {
      const resultCritical = {
        status: 'ok' as const,
        result: {
          status: 'critical',
          performanceRatio: 45,
          loggerId: '925',
        },
      };

      const suggestions = generateDynamicSuggestions(
        'calculate_performance_ratio',
        resultCritical,
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.priority === 'urgent')).toBe(true);
    });

    it('should return empty array for unknown tool without context', () => {
      const result = {
        status: 'ok' as const,
        result: { someData: 'value' },
      };

      const suggestions = generateDynamicSuggestions('unknown_tool', result);

      expect(suggestions).toEqual([]);
    });

    it('should prioritize context-based suggestions over fallback', () => {
      const result = {
        status: 'ok' as const,
        result: {
          // Has both anomaly data AND context
          anomalyCount: 10,
          context: {
            summary: 'Test',
            insights: [],
            next_steps: [
              {
                priority: 'suggested',
                action: 'Context suggestion wins',
                reason: 'From context',
              },
            ],
          },
        },
      };

      const suggestions = generateDynamicSuggestions(
        'analyze_inverter_health',
        result,
      );

      // Should use context, not fallback logic
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].action).toBe('Context suggestion wins');
    });
  });

  // ============================================================
  // Comparison Analysis Helpers Tests
  // ============================================================

  describe('computeBestPerformer', () => {
    it('should return logger with highest average', () => {
      const summary = {
        'logger-1': { average: 5000, peak: 6000, total: 50000 },
        'logger-2': { average: 5500, peak: 6500, total: 55000 },
        'logger-3': { average: 4800, peak: 5800, total: 48000 },
      };

      const result = computeBestPerformer(summary);

      expect(result).toEqual({
        loggerId: 'logger-2',
        average: 5500,
        peak: 6500,
        total: 55000,
      });
    });

    it('should return undefined for empty summary', () => {
      expect(computeBestPerformer({})).toBeUndefined();
    });

    it('should return undefined for null/undefined summary', () => {
      expect(computeBestPerformer(null as never)).toBeUndefined();
      expect(computeBestPerformer(undefined as never)).toBeUndefined();
    });

    it('should handle single logger', () => {
      const summary = {
        'single-logger': { average: 3000, peak: 4000, total: 30000 },
      };

      const result = computeBestPerformer(summary);

      expect(result?.loggerId).toBe('single-logger');
    });

    it('should handle loggers with equal averages', () => {
      const summary = {
        'logger-a': { average: 5000, peak: 6000, total: 50000 },
        'logger-b': { average: 5000, peak: 7000, total: 50000 },
      };

      const result = computeBestPerformer(summary);

      // Should return one of them (first encountered)
      expect(result?.average).toBe(5000);
    });
  });

  describe('computeWorstPerformer', () => {
    it('should return logger with lowest average', () => {
      const summary = {
        'logger-1': { average: 5000, peak: 6000, total: 50000 },
        'logger-2': { average: 5500, peak: 6500, total: 55000 },
        'logger-3': { average: 4800, peak: 5800, total: 48000 },
      };

      const result = computeWorstPerformer(summary);

      expect(result).toEqual({
        loggerId: 'logger-3',
        average: 4800,
        peak: 5800,
        total: 48000,
      });
    });

    it('should return undefined for empty summary', () => {
      expect(computeWorstPerformer({})).toBeUndefined();
    });

    it('should return undefined for null/undefined summary', () => {
      expect(computeWorstPerformer(null as never)).toBeUndefined();
      expect(computeWorstPerformer(undefined as never)).toBeUndefined();
    });

    it('should handle single logger', () => {
      const summary = {
        'single-logger': { average: 3000, peak: 4000, total: 30000 },
      };

      const result = computeWorstPerformer(summary);

      expect(result?.loggerId).toBe('single-logger');
    });
  });

  describe('computeSpreadPercent', () => {
    it('should calculate percentage difference correctly', () => {
      const best = { loggerId: 'best', average: 5000, peak: 6000 };
      const worst = { loggerId: 'worst', average: 4000, peak: 5000 };

      const result = computeSpreadPercent(best, worst);

      // (5000-4000)/5000 * 100 = 20%
      expect(result).toBeCloseTo(20, 1);
    });

    it('should return 0 when best and worst are equal', () => {
      const best = { loggerId: 'best', average: 5000, peak: 6000 };
      const worst = { loggerId: 'worst', average: 5000, peak: 5000 };

      const result = computeSpreadPercent(best, worst);

      expect(result).toBe(0);
    });

    it('should return 0 when best average is 0', () => {
      const best = { loggerId: 'best', average: 0, peak: 0 };
      const worst = { loggerId: 'worst', average: 0, peak: 0 };

      expect(computeSpreadPercent(best, worst)).toBe(0);
    });

    it('should return 0 when best is undefined', () => {
      const worst = { loggerId: 'worst', average: 4000, peak: 5000 };

      expect(computeSpreadPercent(undefined, worst)).toBe(0);
    });

    it('should return 0 when worst is undefined', () => {
      const best = { loggerId: 'best', average: 5000, peak: 6000 };

      expect(computeSpreadPercent(best, undefined)).toBe(0);
    });

    it('should handle large spread percentages', () => {
      const best = { loggerId: 'best', average: 10000, peak: 12000 };
      const worst = { loggerId: 'worst', average: 5000, peak: 6000 };

      const result = computeSpreadPercent(best, worst);

      // (10000-5000)/10000 * 100 = 50%
      expect(result).toBeCloseTo(50, 1);
    });
  });

  describe('Tool argument serialization', () => {
    describe('createToolCallMessage serialization', () => {
      it('should serialize Date objects to ISO strings', () => {
        const date = new Date('2025-01-15T10:30:00Z');
        const message = createToolCallMessage('call_date', 'test_tool', {
          date: date.toISOString(),
        });

        const args = message.tool_calls?.[0]?.args;
        expect(args?.date).toBe('2025-01-15T10:30:00.000Z');
      });

      it('should serialize nested objects correctly', () => {
        const nested = {
          level1: {
            level2: {
              value: 'deep',
              array: [1, 2, 3],
            },
          },
        };
        const message = createToolCallMessage(
          'call_nested',
          'test_tool',
          nested,
        );

        const args = message.tool_calls?.[0]?.args as {
          level1: { level2: { value: string; array: number[] } };
        };
        expect(args?.level1.level2.value).toBe('deep');
        expect(args?.level1.level2.array).toEqual([1, 2, 3]);
      });

      it('should serialize arrays of logger IDs correctly', () => {
        const loggerIds = ['925', '926', '927'];
        const message = createToolCallMessage('call_array', 'compare_loggers', {
          logger_ids: loggerIds,
        });

        const args = message.tool_calls?.[0]?.args;
        expect(args?.logger_ids).toEqual(['925', '926', '927']);
      });

      it('should handle undefined in args gracefully', () => {
        const message = createToolCallMessage('call_undef', 'test_tool', {
          required: 'value',
          optional: undefined,
        });

        const args = message.tool_calls?.[0]?.args;
        expect(args?.required).toBe('value');
        // undefined values may be omitted or preserved depending on serialization
        expect('optional' in args! || args?.optional === undefined).toBe(true);
      });

      it('should handle null in args gracefully', () => {
        const message = createToolCallMessage('call_null', 'test_tool', {
          required: 'value',
          nullable: null,
        });

        const args = message.tool_calls?.[0]?.args;
        expect(args?.required).toBe('value');
        expect(args?.nullable).toBeNull();
      });

      it('should serialize complex date range objects', () => {
        const dateRange = {
          start: '2025-01-01',
          end: '2025-01-15',
        };
        const message = createToolCallMessage('call_range', 'analyze_health', {
          logger_id: '925',
          date_range: dateRange,
        });

        const args = message.tool_calls?.[0]?.args;
        expect(args?.date_range).toEqual({
          start: '2025-01-01',
          end: '2025-01-15',
        });
      });

      it('should handle empty arrays', () => {
        const message = createToolCallMessage('call_empty', 'test_tool', {
          items: [],
        });

        const args = message.tool_calls?.[0]?.args;
        expect(args?.items).toEqual([]);
      });

      it('should handle empty objects', () => {
        const message = createToolCallMessage(
          'call_empty_obj',
          'list_loggers',
          {},
        );

        const args = message.tool_calls?.[0]?.args;
        expect(args).toEqual({});
      });
    });

    describe('createToolResultMessage serialization', () => {
      it('should JSON stringify complex results', () => {
        const complexResult = {
          loggers: [
            { id: '925', type: 'goodwe', status: 'online' },
            { id: '926', type: 'lti', status: 'offline' },
          ],
          summary: { total: 2, online: 1 },
        };

        const message = createToolResultMessage(
          'call_result',
          'list_loggers',
          complexResult,
        );

        const content =
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);
        const parsed = JSON.parse(content) as {
          loggers: unknown[];
          summary: { total: number };
        };
        expect(parsed.loggers).toHaveLength(2);
        expect(parsed.summary.total).toBe(2);
      });

      it('should handle numeric values', () => {
        const result = {
          power: 5000.5,
          count: 10,
          ratio: 0.85,
        };

        const message = createToolResultMessage('call_nums', 'test', result);

        const content =
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);
        const parsed = JSON.parse(content) as {
          power: number;
          count: number;
          ratio: number;
        };
        expect(parsed.power).toBe(5000.5);
        expect(parsed.count).toBe(10);
        expect(parsed.ratio).toBe(0.85);
      });

      it('should handle boolean values', () => {
        const result = {
          isOnline: true,
          hasErrors: false,
        };

        const message = createToolResultMessage('call_bool', 'test', result);

        const content =
          typeof message.content === 'string'
            ? message.content
            : JSON.stringify(message.content);
        const parsed = JSON.parse(content) as {
          isOnline: boolean;
          hasErrors: boolean;
        };
        expect(parsed.isOnline).toBe(true);
        expect(parsed.hasErrors).toBe(false);
      });
    });
  });

  describe('computeComparisonSeverity', () => {
    it('should classify < 10% as similar', () => {
      expect(computeComparisonSeverity(0)).toBe('similar');
      expect(computeComparisonSeverity(5)).toBe('similar');
      expect(computeComparisonSeverity(9.9)).toBe('similar');
    });

    it('should classify 10-30% as moderate_difference', () => {
      expect(computeComparisonSeverity(10)).toBe('moderate_difference');
      expect(computeComparisonSeverity(20)).toBe('moderate_difference');
      expect(computeComparisonSeverity(29.9)).toBe('moderate_difference');
    });

    it('should classify >= 30% as large_difference', () => {
      expect(computeComparisonSeverity(30)).toBe('large_difference');
      expect(computeComparisonSeverity(35)).toBe('large_difference');
      expect(computeComparisonSeverity(50)).toBe('large_difference');
      expect(computeComparisonSeverity(100)).toBe('large_difference');
    });

    it('should handle boundary values correctly', () => {
      // Exactly at 10% should be moderate_difference
      expect(computeComparisonSeverity(10)).toBe('moderate_difference');
      // Exactly at 30% should be large_difference
      expect(computeComparisonSeverity(30)).toBe('large_difference');
    });
  });

  // ============================================================
  // Additional Tests for Uncovered Functions
  // ============================================================

  describe('parseNaturalDateRange', () => {
    it('should parse "last N days" pattern', () => {
      const result = parseNaturalDateRange('last 7 days');
      expect(result).not.toBeNull();
      expect(result?.end).toBe(getLatestDateString());
    });

    it('should parse "last N day" (singular)', () => {
      const result = parseNaturalDateRange('last 1 day');
      expect(result).not.toBeNull();
      expect(result?.end).toBe(getLatestDateString());
      expect(result?.start).toBe(getDateDaysAgo(1));
    });

    it('should parse "past N days" pattern', () => {
      const result = parseNaturalDateRange('past 14 days');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(14));
    });

    it('should parse "last week" phrase', () => {
      const result = parseNaturalDateRange('last week');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(7));
    });

    it('should parse "past week" phrase', () => {
      const result = parseNaturalDateRange('past week');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(7));
    });

    it('should parse "last month" phrase', () => {
      const result = parseNaturalDateRange('last month');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(30));
    });

    it('should parse "past month" phrase', () => {
      const result = parseNaturalDateRange('past month');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(30));
    });

    it('should parse "last 2 weeks" phrase', () => {
      const result = parseNaturalDateRange('last 2 weeks');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(14));
    });

    it('should parse "past 2 weeks" phrase', () => {
      const result = parseNaturalDateRange('past 2 weeks');
      expect(result).not.toBeNull();
      expect(result?.start).toBe(getDateDaysAgo(14));
    });

    it('should return null for unrecognized patterns', () => {
      expect(parseNaturalDateRange('sometime soon')).toBeNull();
      expect(parseNaturalDateRange('maybe next week')).toBeNull();
      expect(parseNaturalDateRange('')).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(parseNaturalDateRange('LAST 7 DAYS')).not.toBeNull();
      expect(parseNaturalDateRange('Last Week')).not.toBeNull();
    });

    it('should handle extra whitespace', () => {
      expect(parseNaturalDateRange('  last 7 days  ')).not.toBeNull();
    });
  });

  describe('resolveLoggersByPattern', () => {
    const mockLoggers: LoggerInfo[] = [
      { loggerId: '925', loggerType: 'goodwe' },
      { loggerId: '926', loggerType: 'lti' },
      { loggerId: 'meteo-1', loggerType: 'mbmet' },
      { loggerId: 'meteo-2', loggerType: 'meteocontrol' },
    ];

    it('should match by name pattern', () => {
      const result = resolveLoggersByPattern('goodwe', undefined, mockLoggers);
      expect(result).toContain('925');
      expect(result).toHaveLength(1);
    });

    it('should match by logger ID pattern', () => {
      const result = resolveLoggersByPattern('meteo', undefined, mockLoggers);
      expect(result).toContain('meteo-1');
      expect(result).toContain('meteo-2');
    });

    it('should match by inverter type pattern', () => {
      const result = resolveLoggersByPattern(
        undefined,
        'inverter',
        mockLoggers,
      );
      expect(result).toContain('925');
      expect(result).toContain('926');
      expect(result).not.toContain('meteo-1');
    });

    it('should match by meteo type pattern', () => {
      const result = resolveLoggersByPattern(undefined, 'meteo', mockLoggers);
      expect(result).toContain('meteo-1');
      expect(result).toContain('meteo-2');
      expect(result).not.toContain('925');
    });

    it('should match all with "all" type pattern', () => {
      const result = resolveLoggersByPattern(undefined, 'all', mockLoggers);
      expect(result).toHaveLength(4);
    });

    it('should combine name and type patterns', () => {
      const result = resolveLoggersByPattern('925', 'inverter', mockLoggers);
      // Should match '925' by name AND all inverters by type
      expect(result).toContain('925');
      expect(result).toContain('926'); // Also an inverter
    });

    it('should return empty array for no matches', () => {
      const result = resolveLoggersByPattern(
        'nonexistent',
        undefined,
        mockLoggers,
      );
      expect(result).toEqual([]);
    });

    it('should return empty array for empty loggers list', () => {
      const result = resolveLoggersByPattern('anything', undefined, []);
      expect(result).toEqual([]);
    });

    it('should be case insensitive for pattern matching', () => {
      const result = resolveLoggersByPattern('GOODWE', undefined, mockLoggers);
      expect(result).toContain('925');
    });

    it('should deduplicate results', () => {
      // '925' should only appear once even if matched by both pattern and type
      const result = resolveLoggersByPattern('925', 'inverter', mockLoggers);
      const count925 = result.filter((id) => id === '925').length;
      expect(count925).toBe(1);
    });
  });

  describe('isMeteoLogger', () => {
    it('should return true for mbmet', () => {
      expect(isMeteoLogger('mbmet')).toBe(true);
    });

    it('should return true for meteocontrol', () => {
      expect(isMeteoLogger('meteocontrol')).toBe(true);
    });

    it('should return true for plexlog', () => {
      expect(isMeteoLogger('plexlog')).toBe(true);
    });

    it('should return false for inverter types', () => {
      expect(isMeteoLogger('goodwe')).toBe(false);
      expect(isMeteoLogger('lti')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isMeteoLogger('MBMET')).toBe(true);
      expect(isMeteoLogger('MeteoControl')).toBe(true);
    });
  });

  describe('isInverterLogger', () => {
    it('should return true for goodwe', () => {
      expect(isInverterLogger('goodwe')).toBe(true);
    });

    it('should return true for lti', () => {
      expect(isInverterLogger('lti')).toBe(true);
    });

    it('should return true for integra', () => {
      expect(isInverterLogger('integra')).toBe(true);
    });

    it('should return true for meier', () => {
      expect(isInverterLogger('meier')).toBe(true);
    });

    it('should return true for smartdog', () => {
      expect(isInverterLogger('smartdog')).toBe(true);
    });

    it('should return false for meteo types', () => {
      expect(isInverterLogger('mbmet')).toBe(false);
      expect(isInverterLogger('meteocontrol')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isInverterLogger('GOODWE')).toBe(true);
      expect(isInverterLogger('SmartDog')).toBe(true);
    });
  });

  describe('createEnhancedSelectionArgs', () => {
    it('should include all basic fields', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Select loggers:',
        options: [{ value: '925', label: 'Logger 925' }],
        selectionType: 'multiple',
        inputType: 'dropdown',
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.prompt).toBe('Select loggers:');
      expect(result.options).toHaveLength(1);
      expect(result.selectionType).toBe('multiple');
      expect(result.inputType).toBe('dropdown');
    });

    it('should set requireConfirmation true when preSelectedValues provided', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Confirm selection:',
        options: [],
        selectionType: 'single',
        inputType: 'dropdown',
        preSelectedValues: ['925'],
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.requireConfirmation).toBe(true);
    });

    it('should set requireConfirmation false when no preSelectedValues', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Select:',
        options: [],
        selectionType: 'single',
        inputType: 'dropdown',
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.requireConfirmation).toBe(false);
    });

    it('should respect explicit requireConfirmation setting', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Select:',
        options: [],
        selectionType: 'single',
        inputType: 'dropdown',
        preSelectedValues: ['925'],
        requireConfirmation: false, // Explicitly set to false
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.requireConfirmation).toBe(false);
    });

    it('should include preFilledDateRange', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Select date range:',
        options: [],
        selectionType: 'single',
        inputType: 'date-range',
        preFilledDateRange: { start: '2025-01-01', end: '2025-01-15' },
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.preFilledDateRange).toEqual({
        start: '2025-01-01',
        end: '2025-01-15',
      });
    });

    it('should include minCount and maxCount for multiple selection', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Select 2-5 loggers:',
        options: [],
        selectionType: 'multiple',
        inputType: 'dropdown',
        minCount: 2,
        maxCount: 5,
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.minCount).toBe(2);
      expect(result.maxCount).toBe(5);
    });

    it('should include contextMessage when provided', () => {
      const config: EnhancedSelectionConfig = {
        prompt: 'Select:',
        contextMessage: 'Based on your previous analysis',
        options: [],
        selectionType: 'single',
        inputType: 'dropdown',
      };

      const result = createEnhancedSelectionArgs(config);

      expect(result.contextMessage).toBe('Based on your previous analysis');
    });
  });

  describe('getOverallDataRange', () => {
    it('should return undefined for empty loggers list', () => {
      expect(getOverallDataRange([])).toBeUndefined();
    });

    it('should return undefined when no loggers have data ranges', () => {
      const loggers: LoggerInfo[] = [
        { loggerId: '925', loggerType: 'goodwe' },
        { loggerId: '926', loggerType: 'lti' },
      ];

      expect(getOverallDataRange(loggers)).toBeUndefined();
    });

    it('should return range for single logger with data', () => {
      const loggers: LoggerInfo[] = [
        {
          loggerId: '925',
          loggerType: 'goodwe',
          earliestData: '2024-06-01T00:00:00Z',
          latestData: '2025-01-15T23:45:00Z',
        },
      ];

      const result = getOverallDataRange(loggers);

      expect(result).toEqual({
        start: '2024-06-01T00:00:00Z',
        end: '2025-01-15T23:45:00Z',
      });
    });

    it('should return earliest start and latest end across multiple loggers', () => {
      const loggers: LoggerInfo[] = [
        {
          loggerId: '925',
          loggerType: 'goodwe',
          earliestData: '2024-08-01T00:00:00Z',
          latestData: '2025-01-10T23:45:00Z',
        },
        {
          loggerId: '926',
          loggerType: 'lti',
          earliestData: '2024-06-01T00:00:00Z', // Earlier
          latestData: '2025-01-15T23:45:00Z', // Later
        },
      ];

      const result = getOverallDataRange(loggers);

      expect(result?.start).toBe('2024-06-01T00:00:00Z');
      expect(result?.end).toBe('2025-01-15T23:45:00Z');
    });

    it('should skip loggers without data ranges', () => {
      const loggers: LoggerInfo[] = [
        { loggerId: '925', loggerType: 'goodwe' }, // No data range
        {
          loggerId: '926',
          loggerType: 'lti',
          earliestData: '2024-06-01T00:00:00Z',
          latestData: '2025-01-15T23:45:00Z',
        },
      ];

      const result = getOverallDataRange(loggers);

      expect(result).toEqual({
        start: '2024-06-01T00:00:00Z',
        end: '2025-01-15T23:45:00Z',
      });
    });
  });

  describe('mapColorSchemeToStyle', () => {
    it('should map success to green color', () => {
      expect(mapColorSchemeToStyle('success')).toBe('#22C55E');
    });

    it('should map warning to amber color', () => {
      expect(mapColorSchemeToStyle('warning')).toBe('#F59E0B');
    });

    it('should map danger to red color', () => {
      expect(mapColorSchemeToStyle('danger')).toBe('#EF4444');
    });

    it('should map neutral to gray color', () => {
      expect(mapColorSchemeToStyle('neutral')).toBe('#6B7280');
    });

    it('should default to neutral for undefined', () => {
      expect(mapColorSchemeToStyle(undefined)).toBe('#6B7280');
    });
  });

  describe('mapComponentHint', () => {
    it('should map chart_line to DynamicChart', () => {
      expect(mapComponentHint('chart_line')).toBe('DynamicChart');
    });

    it('should map chart_bar to DynamicChart', () => {
      expect(mapComponentHint('chart_bar')).toBe('DynamicChart');
    });

    it('should map chart_composed to DynamicChart', () => {
      expect(mapComponentHint('chart_composed')).toBe('DynamicChart');
    });

    it('should map metric_card to MetricCard', () => {
      expect(mapComponentHint('metric_card')).toBe('MetricCard');
    });

    it('should map data_table to DataTable', () => {
      expect(mapComponentHint('data_table')).toBe('DataTable');
    });

    it('should default to DynamicChart for unknown hint', () => {
      expect(mapComponentHint('unknown')).toBe('DynamicChart');
    });

    it('should default to DynamicChart for undefined', () => {
      expect(mapComponentHint(undefined)).toBe('DynamicChart');
    });
  });

  describe('mapHintToChartType', () => {
    it('should map chart_line to line', () => {
      expect(mapHintToChartType('chart_line')).toBe('line');
    });

    it('should map chart_bar to bar', () => {
      expect(mapHintToChartType('chart_bar')).toBe('bar');
    });

    it('should map chart_composed to composed', () => {
      expect(mapHintToChartType('chart_composed')).toBe('composed');
    });

    it('should map chart_pie to pie', () => {
      expect(mapHintToChartType('chart_pie')).toBe('pie');
    });

    it('should default to composed for unknown hint', () => {
      expect(mapHintToChartType('unknown')).toBe('composed');
    });

    it('should default to composed for undefined', () => {
      expect(mapHintToChartType(undefined)).toBe('composed');
    });
  });

  describe('generateDynamicSuggestions additional cases', () => {
    it('should not add urgent suggestion for fleet with 100% online', () => {
      const result = {
        status: 'ok' as const,
        result: {
          status: { percentOnline: 100 },
          devices: { offline: 0 },
        },
      };

      const suggestions = generateDynamicSuggestions(
        'get_fleet_overview',
        result,
      );

      // Should have efficiency suggestion but not urgent diagnose
      const urgentSuggestions = suggestions.filter(
        (s) => s.priority === 'urgent',
      );
      expect(urgentSuggestions).toHaveLength(0);
    });

    it('should not add urgent suggestion for high performance ratio', () => {
      const result = {
        status: 'ok' as const,
        result: {
          performanceRatio: 90,
          loggerId: '925',
        },
      };

      const suggestions = generateDynamicSuggestions(
        'calculate_performance_ratio',
        result,
      );

      // High ratio (>85%) should not trigger any suggestions
      expect(suggestions).toHaveLength(0);
    });

    it('should add recommended suggestion for moderate performance ratio', () => {
      const result = {
        status: 'ok' as const,
        result: {
          performanceRatio: 78,
          status: 'moderate',
        },
      };

      const suggestions = generateDynamicSuggestions(
        'calculate_performance_ratio',
        result,
      );

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].priority).toBe('recommended');
    });

    it('should return empty array when context has explicit empty next_steps', () => {
      const result = {
        status: 'ok' as const,
        result: {
          context: {
            summary: 'All good',
            insights: [],
            next_steps: [], // Explicitly empty
          },
        },
      };

      const suggestions = generateDynamicSuggestions(
        'analyze_inverter_health',
        result,
      );

      expect(suggestions).toEqual([]);
    });

    it('should generate suggestions for get_power_curve', () => {
      const result = {
        status: 'ok' as const,
        result: {
          loggerId: '925',
          date: '2025-01-15',
          data: [],
        },
      };

      const suggestions = generateDynamicSuggestions('get_power_curve', result);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.toolHint === 'compare_loggers')).toBe(
        true,
      );
    });
  });
});
