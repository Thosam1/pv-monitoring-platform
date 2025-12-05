import {
  isEnhancedSuggestion,
  normalizeToEnhancedPriority,
  priorityToBadge,
  isRecoverableError,
  isSuccessResponse,
  createCleanFlowContext,
  SuggestionItem,
  EnhancedSuggestion,
  EnhancedPriority,
  ToolResponse,
  FlowContext,
  FLOW_SPECIFIC_FIELDS,
} from './flow-state';

describe('flow-state utilities', () => {
  describe('isEnhancedSuggestion', () => {
    it('should return true for enhanced suggestion with "urgent" priority', () => {
      const suggestion: EnhancedSuggestion = {
        label: 'Check alerts',
        action: 'Check system alerts',
        priority: 'urgent',
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(true);
    });

    it('should return true for enhanced suggestion with "recommended" priority', () => {
      const suggestion: EnhancedSuggestion = {
        label: 'View health report',
        action: 'Show health report',
        priority: 'recommended',
        reason: 'Based on recent data',
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(true);
    });

    it('should return true for enhanced suggestion with "suggested" priority', () => {
      const suggestion: EnhancedSuggestion = {
        label: 'Compare loggers',
        action: 'Compare logger performance',
        priority: 'suggested',
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(true);
    });

    it('should return true for enhanced suggestion with "optional" priority', () => {
      const suggestion: EnhancedSuggestion = {
        label: 'Explore data',
        action: 'Explore historical data',
        priority: 'optional',
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(true);
    });

    it('should return false for legacy suggestion with "primary" priority', () => {
      const suggestion: SuggestionItem = {
        label: 'View details',
        action: 'Show details',
        priority: 'primary',
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(false);
    });

    it('should return false for legacy suggestion with "secondary" priority', () => {
      const suggestion: SuggestionItem = {
        label: 'More info',
        action: 'Show more information',
        priority: 'secondary',
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(false);
    });

    it('should handle enhanced suggestion with all optional fields', () => {
      const suggestion: EnhancedSuggestion = {
        label: 'Full featured suggestion',
        action: 'Execute full action',
        priority: 'recommended',
        reason: 'Important for monitoring',
        badge: '*',
        icon: 'chart',
        toolHint: 'analyze_inverter_health',
        params: { logger_id: '925', days: 7 },
      };
      expect(isEnhancedSuggestion(suggestion)).toBe(true);
    });
  });

  describe('normalizeToEnhancedPriority', () => {
    it('should convert "primary" to "recommended"', () => {
      expect(normalizeToEnhancedPriority('primary')).toBe('recommended');
    });

    it('should convert "secondary" to "suggested"', () => {
      expect(normalizeToEnhancedPriority('secondary')).toBe('suggested');
    });

    it('should return "urgent" unchanged', () => {
      expect(normalizeToEnhancedPriority('urgent')).toBe('urgent');
    });

    it('should return "recommended" unchanged', () => {
      expect(normalizeToEnhancedPriority('recommended')).toBe('recommended');
    });

    it('should return "suggested" unchanged', () => {
      expect(normalizeToEnhancedPriority('suggested')).toBe('suggested');
    });

    it('should return "optional" unchanged', () => {
      expect(normalizeToEnhancedPriority('optional')).toBe('optional');
    });
  });

  describe('priorityToBadge', () => {
    it('should return "!" for "urgent" priority', () => {
      expect(priorityToBadge('urgent')).toBe('!');
    });

    it('should return "*" for "recommended" priority', () => {
      expect(priorityToBadge('recommended')).toBe('*');
    });

    it('should return ">" for "suggested" priority', () => {
      expect(priorityToBadge('suggested')).toBe('>');
    });

    it('should return null for "optional" priority', () => {
      expect(priorityToBadge('optional')).toBeNull();
    });

    it('should map all EnhancedPriority values', () => {
      const priorities: EnhancedPriority[] = [
        'urgent',
        'recommended',
        'suggested',
        'optional',
      ];
      const badges = priorities.map(priorityToBadge);
      expect(badges).toEqual(['!', '*', '>', null]);
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for "no_data_in_window" status', () => {
      const response: ToolResponse = {
        status: 'no_data_in_window',
        message: 'No data found in the specified time window',
      };
      expect(isRecoverableError(response)).toBe(true);
    });

    it('should return true for "no_data" status', () => {
      const response: ToolResponse = {
        status: 'no_data',
        message: 'No data available',
      };
      expect(isRecoverableError(response)).toBe(true);
    });

    it('should return false for "ok" status', () => {
      const response: ToolResponse = {
        status: 'ok',
        result: { power: 1500 },
      };
      expect(isRecoverableError(response)).toBe(false);
    });

    it('should return false for "success" status', () => {
      const response: ToolResponse = {
        status: 'success',
        result: { energy: 25.5 },
      };
      expect(isRecoverableError(response)).toBe(false);
    });

    it('should return false for "error" status', () => {
      const response: ToolResponse = {
        status: 'error',
        message: 'Internal error',
      };
      expect(isRecoverableError(response)).toBe(false);
    });

    it('should work with response containing availableRange', () => {
      const response: ToolResponse = {
        status: 'no_data_in_window',
        message: 'No data in window',
        availableRange: {
          start: '2025-01-01',
          end: '2025-01-15',
        },
      };
      expect(isRecoverableError(response)).toBe(true);
    });
  });

  describe('isSuccessResponse', () => {
    it('should return true for "ok" status', () => {
      const response: ToolResponse = {
        status: 'ok',
        result: { data: [1, 2, 3] },
      };
      expect(isSuccessResponse(response)).toBe(true);
    });

    it('should return true for "success" status', () => {
      const response: ToolResponse = {
        status: 'success',
        result: { message: 'Operation completed' },
      };
      expect(isSuccessResponse(response)).toBe(true);
    });

    it('should return false for "no_data" status', () => {
      const response: ToolResponse = {
        status: 'no_data',
      };
      expect(isSuccessResponse(response)).toBe(false);
    });

    it('should return false for "no_data_in_window" status', () => {
      const response: ToolResponse = {
        status: 'no_data_in_window',
      };
      expect(isSuccessResponse(response)).toBe(false);
    });

    it('should return false for "error" status', () => {
      const response: ToolResponse = {
        status: 'error',
        message: 'Something went wrong',
      };
      expect(isSuccessResponse(response)).toBe(false);
    });

    it('should work with typed result', () => {
      interface HealthResult {
        health: number;
        issues: string[];
      }
      const response: ToolResponse<HealthResult> = {
        status: 'ok',
        result: { health: 95, issues: [] },
      };
      expect(isSuccessResponse(response)).toBe(true);
    });
  });

  describe('createCleanFlowContext', () => {
    it('should preserve narrativePreferences', () => {
      const context: FlowContext = {
        narrativePreferences: {
          verbosity: 'detailed',
          persona: 'professional',
          personalityTraits: [],
          maxSuggestionsPerResponse: 3,
        },
        selectedLoggerId: '925',
        toolResults: { result: 'data' },
      };

      const cleaned = createCleanFlowContext(context);

      expect(cleaned.narrativePreferences).toEqual(
        context.narrativePreferences,
      );
      expect(cleaned.selectedLoggerId).toBeUndefined();
      expect(cleaned.toolResults).toBeUndefined();
    });

    it('should preserve previousFleetStatus', () => {
      const context: FlowContext = {
        previousFleetStatus: {
          timestamp: '2025-01-01T00:00:00Z',
          percentOnline: 95,
          totalPower: 50000,
          totalEnergy: 250,
          offlineLoggers: ['926'],
          healthScore: 92,
        },
        selectedLoggerId: '925',
      };

      const cleaned = createCleanFlowContext(context);

      expect(cleaned.previousFleetStatus).toEqual(context.previousFleetStatus);
      expect(cleaned.selectedLoggerId).toBeUndefined();
    });

    it('should preserve userTimezone', () => {
      const context: FlowContext = {
        userTimezone: 'America/New_York',
        selectedDate: '2025-01-15',
      };

      const cleaned = createCleanFlowContext(context);

      expect(cleaned.userTimezone).toBe('America/New_York');
      expect(cleaned.selectedDate).toBeUndefined();
    });

    it('should preserve electricityRate', () => {
      const context: FlowContext = {
        electricityRate: 0.25,
        dateRange: { start: '2025-01-01', end: '2025-01-15' },
      };

      const cleaned = createCleanFlowContext(context);

      expect(cleaned.electricityRate).toBe(0.25);
      expect(cleaned.dateRange).toBeUndefined();
    });

    it('should remove all flow-specific fields', () => {
      const context: FlowContext = {
        selectedLoggerId: '925',
        selectedLoggerIds: ['925', '926'],
        selectedDate: '2025-01-15',
        dateRange: { start: '2025-01-01', end: '2025-01-15' },
        toolResults: { health: { status: 'ok' } },
        extractedLoggerName: 'GoodWe',
        analyzeAllLoggers: true,
        extractedArgs: { loggerId: '925' },
        currentPromptArg: 'loggerId',
        argumentSpec: [
          { name: 'loggerId', required: true, type: 'single_logger' },
        ],
        waitingForUserInput: true,
        noLoggersAvailable: false,
        // Also add persistent fields
        userTimezone: 'Europe/Berlin',
      };

      const cleaned = createCleanFlowContext(context);

      // Verify all flow-specific fields are removed
      expect(cleaned.selectedLoggerId).toBeUndefined();
      expect(cleaned.selectedLoggerIds).toBeUndefined();
      expect(cleaned.selectedDate).toBeUndefined();
      expect(cleaned.dateRange).toBeUndefined();
      expect(cleaned.toolResults).toBeUndefined();
      expect(cleaned.extractedLoggerName).toBeUndefined();
      expect(cleaned.analyzeAllLoggers).toBeUndefined();
      expect(cleaned.extractedArgs).toBeUndefined();
      expect(cleaned.currentPromptArg).toBeUndefined();
      expect(cleaned.argumentSpec).toBeUndefined();
      expect(cleaned.waitingForUserInput).toBeUndefined();
      expect(cleaned.noLoggersAvailable).toBeUndefined();

      // Verify persistent field is kept
      expect(cleaned.userTimezone).toBe('Europe/Berlin');
    });

    it('should return empty object for empty context', () => {
      const context: FlowContext = {};
      const cleaned = createCleanFlowContext(context);
      expect(cleaned).toEqual({});
    });

    it('should preserve all persistent fields together', () => {
      const context: FlowContext = {
        narrativePreferences: {
          verbosity: 'brief',
          persona: 'casual',
          personalityTraits: [],
          maxSuggestionsPerResponse: 2,
        },
        previousFleetStatus: {
          timestamp: '2025-01-01T00:00:00Z',
          percentOnline: 100,
          totalPower: 60000,
          totalEnergy: 300,
          offlineLoggers: [],
          healthScore: 98,
        },
        userTimezone: 'Asia/Tokyo',
        electricityRate: 0.15,
        // Flow-specific fields to remove
        selectedLoggerId: '925',
        waitingForUserInput: true,
      };

      const cleaned = createCleanFlowContext(context);

      expect(cleaned.narrativePreferences).toBeDefined();
      expect(cleaned.previousFleetStatus).toBeDefined();
      expect(cleaned.userTimezone).toBe('Asia/Tokyo');
      expect(cleaned.electricityRate).toBe(0.15);
      expect(cleaned.selectedLoggerId).toBeUndefined();
      expect(cleaned.waitingForUserInput).toBeUndefined();
    });

    it('should not preserve undefined persistent fields', () => {
      const context: FlowContext = {
        userTimezone: 'UTC',
        // Other persistent fields are undefined
      };

      const cleaned = createCleanFlowContext(context);

      expect(cleaned).toEqual({ userTimezone: 'UTC' });
      expect(Object.keys(cleaned)).toEqual(['userTimezone']);
    });
  });

  describe('FLOW_SPECIFIC_FIELDS constant', () => {
    it('should contain all expected flow-specific field names', () => {
      const expectedFields = [
        'selectedLoggerId',
        'selectedLoggerIds',
        'selectedDate',
        'dateRange',
        'toolResults',
        'extractedLoggerName',
        'analyzeAllLoggers',
        'extractedArgs',
        'currentPromptArg',
        'argumentSpec',
        'waitingForUserInput',
        'noLoggersAvailable',
      ];

      expect(FLOW_SPECIFIC_FIELDS).toEqual(expectedFields);
    });
  });
});
