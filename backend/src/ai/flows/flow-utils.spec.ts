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
  ALL_DEVICES_PATTERN,
  COMMON_SUGGESTIONS,
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

    it('should have correct format (tool_ prefix)', () => {
      const id = generateToolCallId();

      expect(id).toMatch(/^tool_\d+_[a-z0-9]+$/);
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

  describe('ALL_DEVICES_PATTERN', () => {
    it('should match "all devices"', () => {
      expect(ALL_DEVICES_PATTERN.test('Check all devices')).toBe(true);
    });

    it('should match "all loggers"', () => {
      expect(ALL_DEVICES_PATTERN.test('Show all loggers')).toBe(true);
    });

    it('should match "all inverters"', () => {
      expect(ALL_DEVICES_PATTERN.test('Check all inverters')).toBe(true);
    });

    it('should match "fleet"', () => {
      expect(ALL_DEVICES_PATTERN.test('Show fleet status')).toBe(true);
    });

    it('should match "every device"', () => {
      expect(ALL_DEVICES_PATTERN.test('Check every device')).toBe(true);
    });

    it('should match "each logger"', () => {
      expect(ALL_DEVICES_PATTERN.test('Analyze each logger')).toBe(true);
    });

    it('should not match "one device"', () => {
      expect(ALL_DEVICES_PATTERN.test('Check one device')).toBe(false);
    });

    it('should not match "logger 925"', () => {
      expect(ALL_DEVICES_PATTERN.test('Check logger 925')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(ALL_DEVICES_PATTERN.test('ALL DEVICES')).toBe(true);
      expect(ALL_DEVICES_PATTERN.test('All Loggers')).toBe(true);
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
});
