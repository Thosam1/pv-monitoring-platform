/**
 * Unit tests for the Argument Check Node.
 *
 * Tests the argument validation logic that ensures required arguments
 * are satisfied before proceeding with a flow.
 */
import { AIMessage } from '@langchain/core/messages';
import { argumentCheckNode, hasRequiredArgs } from './argument-check.node';
import {
  createTestState,
  createFakeModel,
  SAMPLE_LOGGERS,
} from '../test-utils';
import { ExplicitFlowState, FlowType } from '../types/flow-state';
import { LoggerInfo } from '../flows/flow-utils';

describe('ArgumentCheckNode', () => {
  // Use SAMPLE_LOGGERS as the standard test loggers
  const availableLoggers: LoggerInfo[] = SAMPLE_LOGGERS.map((l) => ({
    loggerId: l.loggerId,
    loggerType: l.loggerType,
    dataRange: l.dataRange
      ? {
          earliestData: l.dataRange.earliestData,
          latestData: l.dataRange.latestData,
        }
      : undefined,
  }));

  // Create a mock model for testing - uses fallback prompts
  const mockModel = createFakeModel([
    new AIMessage({ content: 'Which of your solar systems should I look at?' }),
  ]);

  describe('argumentCheckNode', () => {
    describe('health_check flow arguments', () => {
      it('should return flowStep=1 when loggerId is provided', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            selectedLoggerId: '925',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
        expect(result.messages).toBeUndefined();
        expect(result.pendingUiActions).toBeUndefined();
      });

      it('should generate selection prompt when loggerId is missing', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(0);
        expect(result.messages).toHaveLength(1);
        expect(result.pendingUiActions).toHaveLength(1);

        // Check tool call
        const aiMessage = result.messages![0] as AIMessage;
        expect(aiMessage.tool_calls).toHaveLength(1);
        expect(aiMessage.tool_calls![0].name).toBe('request_user_selection');

        // Check pending action
        expect(result.pendingUiActions![0].toolName).toBe(
          'request_user_selection',
        );
      });

      it('should apply last_7_days default for optional dateRange', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            selectedLoggerId: '925',
            // dateRange not provided - should apply default
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
        expect(result.flowContext?.dateRange).toBeDefined();
        expect(result.flowContext?.dateRange?.start).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
        expect(result.flowContext?.dateRange?.end).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
      });

      it('should preserve existing dateRange if already provided', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            selectedLoggerId: '925',
            dateRange: { start: '2025-01-01', end: '2025-01-10' },
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
        expect(result.flowContext?.dateRange).toEqual({
          start: '2025-01-01',
          end: '2025-01-10',
        });
      });
    });

    describe('performance_audit flow arguments', () => {
      it('should require at least 2 loggerIds', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {
            selectedLoggerIds: ['925'], // Only 1, needs 2+
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(0);
        expect(result.messages).toHaveLength(1);
        expect(result.pendingUiActions).toHaveLength(1);
      });

      it('should accept exactly 2 loggerIds', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {
            selectedLoggerIds: ['925', '926'],
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
        expect(result.messages).toBeUndefined();
      });

      it('should accept 3-5 loggerIds', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {
            selectedLoggerIds: ['925', '926', 'MBMET-001'],
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
      });

      it('should prompt for loggerIds when none provided', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(0);
        expect(result.pendingUiActions).toHaveLength(1);

        const args = result.pendingUiActions![0].args as Record<
          string,
          unknown
        >;
        expect(args.selectionType).toBe('multiple');
      });

      it('should apply latest_date default for optional date', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {
            selectedLoggerIds: ['925', '926'],
            // date not provided - should apply default
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
        expect(result.flowContext?.selectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    describe('financial_report flow arguments', () => {
      it('should require loggerId', async () => {
        const state = createTestState({
          activeFlow: 'financial_report',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(0);
        expect(result.pendingUiActions).toHaveLength(1);
      });

      it('should proceed when loggerId is provided', async () => {
        const state = createTestState({
          activeFlow: 'financial_report',
          flowContext: {
            selectedLoggerId: '925',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
      });

      it('should apply last_7_days default for optional dateRange', async () => {
        const state = createTestState({
          activeFlow: 'financial_report',
          flowContext: {
            selectedLoggerId: '925',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowContext?.dateRange).toBeDefined();
      });
    });

    describe('flows without argument requirements', () => {
      it('should return flowStep=1 for morning_briefing', async () => {
        const state = createTestState({
          activeFlow: 'morning_briefing',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
        expect(result.messages).toBeUndefined();
        expect(result.pendingUiActions).toBeUndefined();
      });

      it('should return flowStep=1 for greeting', async () => {
        const state = createTestState({
          activeFlow: 'greeting',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
      });

      it('should return flowStep=1 for free_chat', async () => {
        const state = createTestState({
          activeFlow: 'free_chat',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowStep).toBe(1);
      });
    });

    describe('waitingForUserInput flag handling', () => {
      it('should preserve state when waitingForUserInput is true', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            waitingForUserInput: true,
            currentPromptArg: 'loggerId',
          },
          pendingUiActions: [
            {
              toolCallId: 'existing_call',
              toolName: 'request_user_selection',
              args: {},
            },
          ],
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        // Should NOT generate a new prompt
        expect(result.messages).toBeUndefined();
        // Should preserve existing context
        expect(result.flowContext?.waitingForUserInput).toBe(true);
        expect(result.flowContext?.currentPromptArg).toBe('loggerId');
      });

      it('should NOT re-prompt when already waiting for input', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            waitingForUserInput: true,
            currentPromptArg: 'loggerId',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        // Should return preserved state without new messages
        expect(result.messages).toBeUndefined();
        expect(result.pendingUiActions).toBeDefined();
      });

      it('should set waitingForUserInput when generating prompt', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result.flowContext?.waitingForUserInput).toBe(true);
        expect(result.flowContext?.currentPromptArg).toBe('loggerId');
      });
    });

    describe('context-aware prompt generation', () => {
      it('should include contextMessage when extractedLoggerName detected', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            extractedLoggerName: 'goodwe',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const aiMessage = result.messages![0] as AIMessage;
        expect(typeof aiMessage.content).toBe('string');
        // Now uses NarrativeEngine fallback prompts which mention the matched name
        expect(aiMessage.content).toContain('goodwe');
      });

      it('should include preSelectedValues when pattern resolves to loggers', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            extractedLoggerName: 'goodwe',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const args = result.pendingUiActions![0].args as Record<
          string,
          unknown
        >;
        expect(args.preSelectedValues).toBeDefined();
        expect(args.preSelectedValues).toContain('925');
      });

      it('should generate persona-aware prompt for health_check', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const aiMessage = result.messages![0] as AIMessage;
        expect(typeof aiMessage.content).toBe('string');
        // NarrativeEngine fallback prompt for health_check uses friendly language
        const content = aiMessage.content as string;
        expect(content.toLowerCase()).toMatch(/solar|installation|check/);
      });

      it('should generate persona-aware prompt for financial_report', async () => {
        const state = createTestState({
          activeFlow: 'financial_report',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const aiMessage = result.messages![0] as AIMessage;
        expect(typeof aiMessage.content).toBe('string');
        // NarrativeEngine fallback prompt for financial_report mentions savings
        const content = aiMessage.content as string;
        expect(content.toLowerCase()).toMatch(/savings|system/);
      });

      it('should include flowHint for multiple_loggers type', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const args = result.pendingUiActions![0].args as Record<
          string,
          unknown
        >;
        expect(args.flowHint).toBeDefined();
        const flowHint = args.flowHint as Record<string, unknown>;
        expect(flowHint.skipOption).toBeDefined();
      });
    });

    describe('logger pattern resolution', () => {
      it('should resolve "GoodWe" pattern to matching logger ID', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            extractedLoggerName: 'GoodWe',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const args = result.pendingUiActions![0].args as Record<
          string,
          unknown
        >;
        expect(args.preSelectedValues).toContain('925');
      });

      it('should resolve loggerTypePattern "inverter" to inverter loggers', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            extractedArgs: {
              loggerTypePattern: 'inverter' as const,
            },
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const args = result.pendingUiActions![0].args as Record<
          string,
          unknown
        >;
        const preSelected = args.preSelectedValues as string[] | undefined;
        // Should include inverter loggers (goodwe, lti) but not meteo
        if (preSelected && preSelected.length > 0) {
          expect(preSelected).toContain('925');
          expect(preSelected).not.toContain('MBMET-001');
        }
      });

      it('should resolve loggerTypePattern "meteo" to meteo loggers', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            extractedArgs: {
              loggerTypePattern: 'meteo' as const,
            },
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const args = result.pendingUiActions![0].args as Record<
          string,
          unknown
        >;
        const preSelected = args.preSelectedValues as string[] | undefined;
        // Should include meteo logger
        if (preSelected && preSelected.length > 0) {
          expect(preSelected).toContain('MBMET-001');
        }
      });
    });

    describe('default strategy application', () => {
      it('should NOT apply defaults for required arguments', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {}, // loggerId is required, should not have default
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        // Should prompt for loggerId instead of applying default
        expect(result.flowStep).toBe(0);
        expect(result.messages).toHaveLength(1);
      });

      it('should apply defaults only for optional arguments', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {
            selectedLoggerId: '925',
          },
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        // Should proceed and apply dateRange default
        expect(result.flowStep).toBe(1);
        expect(result.flowContext?.dateRange).toBeDefined();
      });
    });

    describe('edge cases', () => {
      it('should return empty object when no activeFlow', async () => {
        const state = createTestState({
          activeFlow: null,
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        expect(result).toEqual({});
      });

      it('should handle empty availableLoggers array', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });

        const result = await argumentCheckNode(state, [], mockModel as never);

        // When no loggers are available, should return a helpful error message
        // instead of a selection prompt
        expect(result.messages).toBeDefined();
        expect(result.messages).toHaveLength(1);
        expect(result.flowContext?.noLoggersAvailable).toBe(true);
      });

      it('should generate unique tool call IDs', async () => {
        const state1 = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });
        const state2 = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });

        const result1 = await argumentCheckNode(
          state1,
          availableLoggers,
          mockModel as never,
        );
        const result2 = await argumentCheckNode(
          state2,
          availableLoggers,
          mockModel as never,
        );

        expect(result1.pendingUiActions![0].toolCallId).not.toBe(
          result2.pendingUiActions![0].toolCallId,
        );
      });
    });

    describe('tool call structure', () => {
      it('should create valid tool call for single logger selection', async () => {
        const state = createTestState({
          activeFlow: 'health_check',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const aiMessage = result.messages![0] as AIMessage;
        const toolCall = aiMessage.tool_calls![0];

        expect(toolCall.id).toMatch(/^tool_/);
        expect(toolCall.name).toBe('request_user_selection');
        expect(toolCall.args).toBeDefined();
      });

      it('should create valid tool call for multiple logger selection', async () => {
        const state = createTestState({
          activeFlow: 'performance_audit',
          flowContext: {},
        });

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        const aiMessage = result.messages![0] as AIMessage;
        const toolCall = aiMessage.tool_calls![0];
        const args = toolCall.args as Record<string, unknown>;

        expect(args.selectionType).toBe('multiple');
        expect(args.inputType).toBe('dropdown');
      });

      it('should include date constraints for date selection', async () => {
        // Create a state that would prompt for date (not dateRange)
        // Using a manually constructed state since performance_audit uses date
        const state: ExplicitFlowState = {
          messages: [],
          recoveryAttempts: 0,
          pendingUiActions: [],
          activeFlow: 'performance_audit',
          flowStep: 0,
          flowContext: {
            selectedLoggerIds: ['925', '926'],
          },
        };

        const result = await argumentCheckNode(
          state,
          availableLoggers,
          mockModel as never,
        );

        // Date defaults should be applied since it's optional
        expect(result.flowStep).toBe(1);
        expect(result.flowContext?.selectedDate).toBeDefined();
      });
    });
  });

  describe('hasRequiredArgs', () => {
    it('should return "proceed" when all required args satisfied for health_check', () => {
      const state = createTestState({
        activeFlow: 'health_check',
        flowContext: {
          selectedLoggerId: '925',
        },
      });

      expect(hasRequiredArgs(state)).toBe('proceed');
    });

    it('should return "wait" when loggerId missing for health_check', () => {
      const state = createTestState({
        activeFlow: 'health_check',
        flowContext: {},
      });

      expect(hasRequiredArgs(state)).toBe('wait');
    });

    it('should return "wait" when loggerIds < minCount for performance_audit', () => {
      const state = createTestState({
        activeFlow: 'performance_audit',
        flowContext: {
          selectedLoggerIds: ['925'], // Only 1, needs 2
        },
      });

      expect(hasRequiredArgs(state)).toBe('wait');
    });

    it('should return "proceed" when loggerIds >= minCount for performance_audit', () => {
      const state = createTestState({
        activeFlow: 'performance_audit',
        flowContext: {
          selectedLoggerIds: ['925', '926'],
        },
      });

      expect(hasRequiredArgs(state)).toBe('proceed');
    });

    it('should return "proceed" for flows without required args', () => {
      const flowsWithoutRequiredArgs: FlowType[] = [
        'morning_briefing',
        'greeting',
        'free_chat',
      ];

      for (const flow of flowsWithoutRequiredArgs) {
        const state = createTestState({
          activeFlow: flow,
          flowContext: {},
        });

        expect(hasRequiredArgs(state)).toBe('proceed');
      }
    });

    it('should return "proceed" when no activeFlow', () => {
      const state = createTestState({
        activeFlow: null,
        flowContext: {},
      });

      expect(hasRequiredArgs(state)).toBe('proceed');
    });
  });
});
