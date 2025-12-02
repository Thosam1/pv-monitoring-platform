/**
 * Unit tests for router.node.ts
 *
 * Tests intent classification using FakeStreamingChatModel for deterministic behavior.
 */
import { routerNode, routeToFlow } from './router.node';
import {
  createFakeModel,
  createClassificationResponse,
  createErrorModel,
  createTestState,
  createStateWithUserMessage,
  createStateWithHistory,
  USER_MESSAGES,
} from '../test-utils';

describe('RouterNode', () => {
  describe('routerNode', () => {
    describe('morning_briefing classification', () => {
      it('should classify "morning briefing" request', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('morning_briefing', 0.95),
        ]);

        const state = createStateWithUserMessage('Give me a morning briefing');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('morning_briefing');
        expect(result.flowStep).toBe(0);
        expect(result.recoveryAttempts).toBe(0);
      });

      it('should classify "fleet overview" request', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('morning_briefing', 0.9),
        ]);

        const state = createStateWithUserMessage('How is the fleet doing?');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('morning_briefing');
      });

      it('should classify "site status" request', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('morning_briefing', 0.88),
        ]);

        const state = createStateWithUserMessage('Status report please');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('morning_briefing');
      });
    });

    describe('financial_report classification', () => {
      it('should classify savings query', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('financial_report', 0.92),
        ]);

        const state = createStateWithUserMessage(
          'How much did I save this month?',
        );
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('financial_report');
      });

      it('should classify ROI query', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('financial_report', 0.89),
        ]);

        const state = createStateWithUserMessage('What is my ROI?');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('financial_report');
      });
    });

    describe('performance_audit classification', () => {
      it('should classify comparison query', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('performance_audit', 0.93),
        ]);

        const state = createStateWithUserMessage('Compare all my inverters');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('performance_audit');
      });

      it('should classify efficiency query', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('performance_audit', 0.87),
        ]);

        const state = createStateWithUserMessage('Which logger performs best?');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('performance_audit');
      });
    });

    describe('health_check classification', () => {
      it('should classify health check query', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('health_check', 0.94),
        ]);

        const state = createStateWithUserMessage('Check health of logger 925');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('health_check');
      });

      it('should classify anomaly query', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('health_check', 0.91),
        ]);

        const state = createStateWithUserMessage('Are there any anomalies?');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('health_check');
      });

      it('should extract loggerId from message', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('health_check', 0.95, {
            loggerId: '925',
          }),
        ]);

        const state = createStateWithUserMessage('Check health of logger 925');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('health_check');
        expect(result.flowContext?.selectedLoggerId).toBe('925');
      });
    });

    describe('free_chat classification', () => {
      it('should classify general queries as free_chat', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('free_chat', 0.75),
        ]);

        const state = createStateWithUserMessage(
          'What is the power output right now?',
        );
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('free_chat');
      });

      it('should classify specific data query as free_chat', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('free_chat', 0.82),
        ]);

        const state = createStateWithUserMessage(
          'Get power curve for logger 925 on January 10th',
        );
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('free_chat');
      });
    });

    describe('parameter extraction', () => {
      it('should extract loggerId from classification', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('health_check', 0.95, {
            loggerId: '925',
          }),
        ]);

        const state = createStateWithUserMessage('Check logger 925');
        const result = await routerNode(state, fakeModel as never);

        expect(result.flowContext?.selectedLoggerId).toBe('925');
      });

      it('should extract loggerName from classification', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('health_check', 0.9, {
            loggerName: 'GoodWe',
          }),
        ]);

        const state = createStateWithUserMessage('Check the GoodWe inverter');
        const result = await routerNode(state, fakeModel as never);

        expect(result.flowContext?.extractedLoggerName).toBe('GoodWe');
      });

      it('should extract date from classification', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('free_chat', 0.85, {
            loggerId: '925',
            date: '2025-01-10',
          }),
        ]);

        const state = createStateWithUserMessage(
          'Show power curve for 925 on January 10',
        );
        const result = await routerNode(state, fakeModel as never);

        expect(result.flowContext?.selectedDate).toBe('2025-01-10');
      });

      it('should extract multiple parameters', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('free_chat', 0.88, {
            loggerId: '926',
            loggerName: 'LTI',
            date: '2025-01-15',
          }),
        ]);

        const state = createStateWithUserMessage(
          'Get data for LTI logger 926 on January 15',
        );
        const result = await routerNode(state, fakeModel as never);

        expect(result.flowContext?.selectedLoggerId).toBe('926');
        expect(result.flowContext?.extractedLoggerName).toBe('LTI');
        expect(result.flowContext?.selectedDate).toBe('2025-01-15');
      });
    });

    describe('selection response handling', () => {
      it('should handle logger selection response', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse(
            'health_check',
            0.95,
            { loggerId: '925' },
            true, // isContinuation
          ),
        ]);

        const state = createStateWithHistory([
          ['user', 'Check health of my inverter'],
          ['assistant', 'Which logger would you like to check?'],
          ['user', 'I selected: 925'],
        ]);

        const result = await routerNode(state, fakeModel as never);

        expect(result.flowContext?.selectedLoggerId).toBe('925');
      });

      it('should handle date selection response', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse(
            'free_chat',
            0.9,
            { date: '2025-01-10' },
            true,
          ),
        ]);

        const state = createStateWithHistory([
          ['user', 'Show me the power curve'],
          ['assistant', 'Please select a date:'],
          ['user', '2025-01-10'],
        ]);

        const result = await routerNode(state, fakeModel as never);

        expect(result.flowContext?.selectedDate).toBe('2025-01-10');
      });
    });

    describe('error handling', () => {
      it('should default to free_chat when no user message found', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('morning_briefing', 0.95),
        ]);

        const state = createTestState({ messages: [] });
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('free_chat');
        expect(result.flowContext).toEqual({});
      });

      it('should default to free_chat on LLM error', async () => {
        const errorModel = createErrorModel('LLM connection failed');

        const state = createStateWithUserMessage('Check my system');
        const result = await routerNode(state, errorModel as never);

        expect(result.activeFlow).toBe('free_chat');
      });

      it('should default to free_chat on invalid JSON response', async () => {
        const fakeModel = createFakeModel([
          { content: 'This is not valid JSON' } as never,
        ]);

        const state = createStateWithUserMessage('Check my system');
        const result = await routerNode(state, fakeModel as never);

        expect(result.activeFlow).toBe('free_chat');
      });
    });

    describe('state reset', () => {
      it('should reset recovery attempts on new flow', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('morning_briefing', 0.95),
        ]);

        const state = createStateWithUserMessage('Morning briefing');
        state.recoveryAttempts = 2; // Previous recovery state

        const result = await routerNode(state, fakeModel as never);

        expect(result.recoveryAttempts).toBe(0);
      });

      it('should reset flow step on new classification', async () => {
        const fakeModel = createFakeModel([
          createClassificationResponse('health_check', 0.95),
        ]);

        const state = createStateWithUserMessage('Check health');
        state.flowStep = 3; // Previous step

        const result = await routerNode(state, fakeModel as never);

        expect(result.flowStep).toBe(0);
      });
    });
  });

  describe('routeToFlow', () => {
    it('should return the active flow when set', () => {
      const state = createTestState({ activeFlow: 'morning_briefing' });
      expect(routeToFlow(state)).toBe('morning_briefing');
    });

    it('should return free_chat when no active flow', () => {
      const state = createTestState({ activeFlow: null });
      expect(routeToFlow(state)).toBe('free_chat');
    });

    it('should route to each flow type correctly', () => {
      const flows = [
        'morning_briefing',
        'financial_report',
        'performance_audit',
        'health_check',
        'free_chat',
      ] as const;

      for (const flow of flows) {
        const state = createTestState({ activeFlow: flow });
        expect(routeToFlow(state)).toBe(flow);
      }
    });
  });
});

describe('Integration: Router with sample messages', () => {
  it.each(USER_MESSAGES.morningBriefing)(
    'should classify "%s" as morning_briefing',
    async (message) => {
      const fakeModel = createFakeModel([
        createClassificationResponse('morning_briefing', 0.9),
      ]);

      const state = createStateWithUserMessage(message);
      const result = await routerNode(state, fakeModel as never);

      expect(result.activeFlow).toBe('morning_briefing');
    },
  );

  it.each(USER_MESSAGES.financialReport)(
    'should classify "%s" as financial_report',
    async (message) => {
      const fakeModel = createFakeModel([
        createClassificationResponse('financial_report', 0.9),
      ]);

      const state = createStateWithUserMessage(message);
      const result = await routerNode(state, fakeModel as never);

      expect(result.activeFlow).toBe('financial_report');
    },
  );

  it.each(USER_MESSAGES.healthCheck)(
    'should classify "%s" as health_check',
    async (message) => {
      const fakeModel = createFakeModel([
        createClassificationResponse('health_check', 0.9),
      ]);

      const state = createStateWithUserMessage(message);
      const result = await routerNode(state, fakeModel as never);

      expect(result.activeFlow).toBe('health_check');
    },
  );
});
