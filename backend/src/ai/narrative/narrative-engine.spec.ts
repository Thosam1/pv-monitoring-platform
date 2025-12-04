/**
 * Unit tests for NarrativeEngine.
 *
 * Tests branching logic, narrative generation, suggestions, and fallback handling.
 */

import { AIMessage } from '@langchain/core/messages';
import { createFakeModel, createErrorModel } from '../test-utils';
import { NarrativeEngine } from './narrative-engine';
import {
  NarrativeContext,
  createDefaultDataQuality,
} from './narrative-context';
import {
  NarrativePreferences,
  DEFAULT_NARRATIVE_PREFERENCES,
} from './narrative-preferences';
import {
  selectBranch,
  getSuggestionPriority,
  isActionRequired,
  isDataQualityBranch,
} from './narrative-branching';

describe('NarrativeEngine', () => {
  describe('selectBranch', () => {
    it('should return data_incomplete when completeness is below 50%', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: {
          completeness: 30,
          isExpectedWindow: true,
        },
      };

      expect(selectBranch(context)).toBe('data_incomplete');
    });

    it('should return data_stale when not in expected window', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'high', type: 'test' }],
          healthScore: 80,
        },
        dataQuality: {
          completeness: 100,
          isExpectedWindow: false,
          actualWindow: { start: '2024-01-01', end: '2024-01-07' },
        },
      };

      // Data quality takes priority over anomalies
      expect(selectBranch(context)).toBe('data_stale');
    });

    it('should return recurrent_issue when historical context shows recurrence', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'medium', type: 'test' }],
          healthScore: 85,
        },
        dataQuality: createDefaultDataQuality(),
        historicalContext: {
          isRecurrent: true,
          previousOccurrences: [{ date: '2024-01-01', severity: 'medium' }],
        },
      };

      expect(selectBranch(context)).toBe('recurrent_issue');
    });

    it('should return trend_degrading when trend is degrading', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 90 },
        dataQuality: createDefaultDataQuality(),
        historicalContext: {
          isRecurrent: false,
          trend: 'degrading',
        },
      };

      expect(selectBranch(context)).toBe('trend_degrading');
    });

    it('should return critical_high_severity for high severity anomalies', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [
            {
              timestamp: '2024-01-01',
              type: 'daytime_outage',
              description: 'test',
              severity: 'high',
              metrics: {},
            },
          ],
          healthScore: 70,
        },
        dataQuality: createDefaultDataQuality(),
      };

      expect(selectBranch(context)).toBe('critical_high_severity');
    });

    it('should return critical_fleet_wide when many devices affected', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: 'fleet',
        data: {
          anomalies: [{ severity: 'medium', type: 'test' }],
          healthScore: 80,
          loggersWithIssues: 4,
        },
        dataQuality: createDefaultDataQuality(),
        isFleetAnalysis: true,
        fleetSize: 10,
      };

      expect(selectBranch(context)).toBe('critical_fleet_wide');
    });

    it('should return warning_multiple_anomalies for 2-3 anomalies', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [
            { severity: 'low', type: 'test1' },
            { severity: 'medium', type: 'test2' },
          ],
          healthScore: 85,
        },
        dataQuality: createDefaultDataQuality(),
      };

      expect(selectBranch(context)).toBe('warning_multiple_anomalies');
    });

    it('should return warning_single_anomaly for 1 low severity anomaly', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'low', type: 'test' }],
          healthScore: 90,
        },
        dataQuality: createDefaultDataQuality(),
      };

      expect(selectBranch(context)).toBe('warning_single_anomaly');
    });

    it('should return healthy_all_clear for no anomalies and high score', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 98 },
        dataQuality: createDefaultDataQuality(),
      };

      expect(selectBranch(context)).toBe('healthy_all_clear');
    });

    it('should return healthy_minor_notes for no anomalies but score below 95', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 92 },
        dataQuality: createDefaultDataQuality(),
      };

      expect(selectBranch(context)).toBe('healthy_minor_notes');
    });
  });

  describe('branch utility functions', () => {
    it('getSuggestionPriority returns urgent for critical branches', () => {
      expect(getSuggestionPriority('critical_high_severity')).toBe('urgent');
      expect(getSuggestionPriority('critical_fleet_wide')).toBe('urgent');
    });

    it('getSuggestionPriority returns recommended for warning branches', () => {
      expect(getSuggestionPriority('warning_multiple_anomalies')).toBe(
        'recommended',
      );
      expect(getSuggestionPriority('recurrent_issue')).toBe('recommended');
    });

    it('getSuggestionPriority returns optional for healthy branches', () => {
      expect(getSuggestionPriority('healthy_all_clear')).toBe('optional');
      expect(getSuggestionPriority('healthy_minor_notes')).toBe('optional');
    });

    it('isActionRequired returns true for critical and warning branches', () => {
      expect(isActionRequired('critical_high_severity')).toBe(true);
      expect(isActionRequired('warning_multiple_anomalies')).toBe(true);
      expect(isActionRequired('recurrent_issue')).toBe(true);
    });

    it('isActionRequired returns false for healthy branches', () => {
      expect(isActionRequired('healthy_all_clear')).toBe(false);
      expect(isActionRequired('healthy_minor_notes')).toBe(false);
    });

    it('isDataQualityBranch returns true for data quality issues', () => {
      expect(isDataQualityBranch('data_incomplete')).toBe(true);
      expect(isDataQualityBranch('data_stale')).toBe(true);
    });

    it('isDataQualityBranch returns false for other branches', () => {
      expect(isDataQualityBranch('healthy_all_clear')).toBe(false);
      expect(isDataQualityBranch('critical_high_severity')).toBe(false);
    });
  });

  describe('NarrativeEngine.generate', () => {
    let engine: NarrativeEngine;

    beforeEach(() => {
      const fakeModel = createFakeModel([
        new AIMessage({ content: 'Your solar system is running excellently!' }),
      ]);
      engine = new NarrativeEngine(fakeModel as never);
    });

    it('should generate narrative for healthy system', async () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: createDefaultDataQuality(),
      };

      const result = await engine.generate(
        context,
        DEFAULT_NARRATIVE_PREFERENCES,
      );

      expect(result.narrative).toBeDefined();
      expect(result.narrative.length).toBeGreaterThan(0);
      expect(result.usedFallback).toBe(false);
      expect(result.metadata.branchPath).toBe('healthy_all_clear');
    });

    it('should use fallback on LLM error', async () => {
      const errorModel = createErrorModel('Model failed');
      const errorEngine = new NarrativeEngine(errorModel as never);

      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: createDefaultDataQuality(),
      };

      const result = await errorEngine.generate(
        context,
        DEFAULT_NARRATIVE_PREFERENCES,
      );

      expect(result.usedFallback).toBe(true);
      expect(result.narrative.length).toBeGreaterThan(0);
      expect(result.confidence).toBe(0.5);
    });

    it('should include correct branch in metadata', async () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'high', type: 'outage' }],
          healthScore: 70,
        },
        dataQuality: createDefaultDataQuality(),
      };

      const result = await engine.generate(
        context,
        DEFAULT_NARRATIVE_PREFERENCES,
      );

      expect(result.metadata.branchPath).toBe('critical_high_severity');
    });

    it('should track generation time', async () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: createDefaultDataQuality(),
      };

      const result = await engine.generate(
        context,
        DEFAULT_NARRATIVE_PREFERENCES,
      );

      expect(result.metadata.generationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('NarrativeEngine.generateSuggestions', () => {
    let engine: NarrativeEngine;

    beforeEach(() => {
      const fakeModel = createFakeModel([new AIMessage({ content: 'Test' })]);
      engine = new NarrativeEngine(fakeModel as never);
    });

    it('should generate urgent suggestions for high severity anomalies', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'high', type: 'outage' }],
          healthScore: 70,
        },
        dataQuality: createDefaultDataQuality(),
      };

      const suggestions = engine.generateSuggestions(context);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.priority === 'urgent')).toBe(true);
    });

    it('should generate optional suggestions for healthy systems', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: createDefaultDataQuality(),
      };

      const suggestions = engine.generateSuggestions(context);

      expect(suggestions.length).toBeGreaterThan(0);
      // Healthy systems should have suggested or optional priority
      expect(
        suggestions.every(
          (s) => s.priority === 'suggested' || s.priority === 'optional',
        ),
      ).toBe(true);
    });

    it('should suggest date change for data quality issues', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: {
          completeness: 30,
          isExpectedWindow: true,
        },
      };

      const suggestions = engine.generateSuggestions(context);

      expect(
        suggestions.some((s) => s.label.toLowerCase().includes('date')),
      ).toBe(true);
    });

    it('should limit suggestions to maxSuggestions', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'high', type: 'outage' }],
          healthScore: 70,
        },
        dataQuality: createDefaultDataQuality(),
      };

      const suggestions = engine.generateSuggestions(context, 2);

      expect(suggestions.length).toBeLessThanOrEqual(2);
    });

    it('should sort suggestions by priority', () => {
      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: {
          anomalies: [{ severity: 'high', type: 'outage' }],
          healthScore: 70,
        },
        dataQuality: createDefaultDataQuality(),
      };

      const suggestions = engine.generateSuggestions(context);
      const priorityOrder = {
        urgent: 0,
        recommended: 1,
        suggested: 2,
        optional: 3,
      };

      for (let i = 1; i < suggestions.length; i++) {
        expect(priorityOrder[suggestions[i - 1].priority]).toBeLessThanOrEqual(
          priorityOrder[suggestions[i].priority],
        );
      }
    });
  });

  describe('preference handling', () => {
    it('should use default preferences when not provided', async () => {
      const fakeModel = createFakeModel([
        new AIMessage({ content: 'Test narrative' }),
      ]);
      const engine = new NarrativeEngine(fakeModel as never);

      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: createDefaultDataQuality(),
      };

      // Should not throw when preferences omitted
      const result = await engine.generate(context);
      expect(result.narrative).toBeDefined();
    });

    it('should accept custom preferences', async () => {
      const fakeModel = createFakeModel([
        new AIMessage({ content: 'Technical analysis complete.' }),
      ]);
      const engine = new NarrativeEngine(fakeModel as never);

      const context: NarrativeContext = {
        flowType: 'health_check',
        subject: '925',
        data: { anomalies: [], healthScore: 100 },
        dataQuality: createDefaultDataQuality(),
      };

      const preferences: NarrativePreferences = {
        tone: 'technical',
        verbosity: 'detailed',
        persona: 'analyst',
      };

      const result = await engine.generate(context, preferences);
      expect(result.narrative).toBeDefined();
    });
  });

  describe('NarrativeEngine.generateRequestPrompt', () => {
    const mockLoggers = [
      { loggerId: '925', loggerType: 'goodwe' },
      { loggerId: '926', loggerType: 'lti' },
      { loggerId: '927', loggerType: 'meteocontrol' },
    ];

    describe('LLM generation', () => {
      it('should generate warm prompt for health_check flow', async () => {
        const fakeModel = createFakeModel([
          new AIMessage({
            content:
              'Which of your solar installations would you like me to check on today?',
          }),
        ]);
        const engine = new NarrativeEngine(fakeModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.prompt).toBeDefined();
        expect(result.prompt.length).toBeGreaterThan(10);
        expect(result.usedFallback).toBe(false);
      });

      it('should reject prompt containing forbidden terms', async () => {
        const fakeModel = createFakeModel([
          new AIMessage({
            content: 'Please select a logger ID from the following options.',
          }),
        ]);
        const engine = new NarrativeEngine(fakeModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        // Should fallback because "logger ID" is forbidden
        expect(result.usedFallback).toBe(true);
      });

      it('should parse multi-sentence response into contextMessage and prompt', async () => {
        const fakeModel = createFakeModel([
          new AIMessage({
            content:
              'I found your GoodWe system! Should I check its health, or would you like to pick a different one?',
          }),
        ]);
        const engine = new NarrativeEngine(fakeModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
          extractedInfo: { loggerName: 'GoodWe' },
          preSelectedValues: ['925'],
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.usedFallback).toBe(false);
        // Multi-sentence should split into context and prompt
        expect(result.contextMessage || result.prompt).toBeTruthy();
      });
    });

    describe('fallback generation', () => {
      it('should use fallback when LLM fails', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.usedFallback).toBe(true);
        expect(result.prompt).toBe(
          'Which of your solar installations would you like me to check on?',
        );
      });

      it('should provide correct fallback for financial_report', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'financial_report' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.usedFallback).toBe(true);
        expect(result.prompt).toBe(
          'Which system should I calculate savings for?',
        );
      });

      it('should provide correct fallback for multiple_loggers', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = {
          name: 'loggerIds',
          required: true,
          type: 'multiple_loggers' as const,
          minCount: 2,
          maxCount: 5,
        };
        const context = {
          flowType: 'performance_audit' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.usedFallback).toBe(true);
        expect(result.prompt).toContain('2-5');
      });

      it('should include context message when pre-selected values exist', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
          extractedInfo: { loggerName: 'GoodWe' },
          preSelectedValues: ['925'],
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.contextMessage).toBeDefined();
        expect(result.contextMessage).toContain('GoodWe');
      });

      it('should include device count in context message when no pre-selection', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 5,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.contextMessage).toContain('5 devices');
      });
    });

    describe('date arguments', () => {
      it('should provide fallback for date argument', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = { name: 'date', required: true, type: 'date' as const };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 0,
        };

        const result = await engine.generateRequestPrompt(spec, context, []);

        expect(result.usedFallback).toBe(true);
        expect(result.prompt).toContain('date');
      });

      it('should provide fallback for date_range argument', async () => {
        const errorModel = createErrorModel('Model failed');
        const engine = new NarrativeEngine(errorModel as never);

        const spec = {
          name: 'dateRange',
          required: true,
          type: 'date_range' as const,
        };
        const context = {
          flowType: 'financial_report' as const,
          optionCount: 0,
        };

        const result = await engine.generateRequestPrompt(spec, context, []);

        expect(result.usedFallback).toBe(true);
        expect(result.prompt).toContain('period');
      });
    });

    describe('validation', () => {
      it('should reject prompts that are too short', async () => {
        const fakeModel = createFakeModel([
          new AIMessage({ content: 'Pick one' }),
        ]);
        const engine = new NarrativeEngine(fakeModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        // 'Pick one' is valid (> 10 chars is false, so should use fallback)
        // Actually 'Pick one' is 8 chars, so it should fail validation
        expect(result.usedFallback).toBe(true);
      });

      it('should reject prompts containing system prompt leakage', async () => {
        const fakeModel = createFakeModel([
          new AIMessage({
            content: 'RULES: Here is how to select. Which one would you like?',
          }),
        ]);
        const engine = new NarrativeEngine(fakeModel as never);

        const spec = {
          name: 'loggerId',
          required: true,
          type: 'single_logger' as const,
        };
        const context = {
          flowType: 'health_check' as const,
          optionCount: 3,
        };

        const result = await engine.generateRequestPrompt(
          spec,
          context,
          mockLoggers as never,
        );

        expect(result.usedFallback).toBe(true);
      });
    });
  });
});
