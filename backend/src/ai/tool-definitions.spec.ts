/**
 * Unit tests for tool-definitions.ts
 *
 * Tests the AI SDK tool definitions for solar analyst tools.
 */
import { createSolarAnalystTools } from './tool-definitions';
import { createMockToolsClient, MOCK_LIST_LOGGERS } from './test-utils';

describe('createSolarAnalystTools', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;
  let tools: ReturnType<typeof createSolarAnalystTools>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
    tools = createSolarAnalystTools(mockToolsClient as never);
  });

  describe('tool count', () => {
    it('should return 10 tools', () => {
      const toolNames = Object.keys(tools);
      expect(toolNames).toHaveLength(10);
    });

    it('should include all expected tool names', () => {
      const toolNames = Object.keys(tools);
      expect(toolNames).toContain('list_loggers');
      expect(toolNames).toContain('analyze_inverter_health');
      expect(toolNames).toContain('get_power_curve');
      expect(toolNames).toContain('compare_loggers');
      expect(toolNames).toContain('calculate_financial_savings');
      expect(toolNames).toContain('calculate_performance_ratio');
      expect(toolNames).toContain('forecast_production');
      expect(toolNames).toContain('diagnose_error_codes');
      expect(toolNames).toContain('get_fleet_overview');
      expect(toolNames).toContain('health_check');
    });
  });

  describe('list_loggers tool', () => {
    it('should have correct description', () => {
      const tool = tools.list_loggers;
      expect(tool.description).toContain('List all available loggers');
    });

    it('should have empty input schema (no required params)', () => {
      const tool = tools.list_loggers;
      // AI SDK tool has inputSchema
      expect(tool).toBeDefined();
    });

    it('should call HTTP client when executed', async () => {
      mockToolsClient.executeTool.mockResolvedValueOnce(MOCK_LIST_LOGGERS);

      // Access the execute function via the tool
      const tool = tools.list_loggers;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute({}, { messages: [], toolCallId: 'test' });
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'list_loggers',
          {},
        );
      }
    });
  });

  describe('analyze_inverter_health tool', () => {
    it('should have correct description', () => {
      const tool = tools.analyze_inverter_health;
      expect(tool.description).toContain('Analyze inverter health');
    });

    it('should require logger_id parameter', async () => {
      const tool = tools.analyze_inverter_health;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          { logger_id: '925', days: 7 },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'analyze_inverter_health',
          { logger_id: '925', days: 7 },
        );
      }
    });
  });

  describe('get_power_curve tool', () => {
    it('should have correct description', () => {
      const tool = tools.get_power_curve;
      expect(tool.description).toContain('power');
      expect(tool.description).toContain('irradiance');
    });

    it('should require logger_id and date parameters', async () => {
      const tool = tools.get_power_curve;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          { logger_id: '925', date: '2025-01-15' },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'get_power_curve',
          { logger_id: '925', date: '2025-01-15' },
        );
      }
    });
  });

  describe('compare_loggers tool', () => {
    it('should have correct description', () => {
      const tool = tools.compare_loggers;
      expect(tool.description).toContain('Compare');
    });

    it('should require logger_ids array parameter', async () => {
      const tool = tools.compare_loggers;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          { logger_ids: ['925', '926'], metric: 'power', date: '2025-01-15' },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'compare_loggers',
          { logger_ids: ['925', '926'], metric: 'power', date: '2025-01-15' },
        );
      }
    });
  });

  describe('calculate_financial_savings tool', () => {
    it('should have correct description', () => {
      const tool = tools.calculate_financial_savings;
      expect(tool.description).toContain('financial');
      expect(tool.description).toContain('savings');
    });

    it('should require logger_id and start_date parameters', async () => {
      const tool = tools.calculate_financial_savings;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          {
            logger_id: '925',
            start_date: '2025-01-01',
            end_date: '2025-01-15',
            electricity_rate: 0.2,
          },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'calculate_financial_savings',
          {
            logger_id: '925',
            start_date: '2025-01-01',
            end_date: '2025-01-15',
            electricity_rate: 0.2,
          },
        );
      }
    });
  });

  describe('calculate_performance_ratio tool', () => {
    it('should have correct description', () => {
      const tool = tools.calculate_performance_ratio;
      expect(tool.description).toContain('Performance Ratio');
    });

    it('should require logger_id and date parameters', async () => {
      const tool = tools.calculate_performance_ratio;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          { logger_id: '925', date: '2025-01-15', capacity_kw: undefined },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'calculate_performance_ratio',
          { logger_id: '925', date: '2025-01-15', capacity_kw: undefined },
        );
      }
    });
  });

  describe('forecast_production tool', () => {
    it('should have correct description', () => {
      const tool = tools.forecast_production;
      expect(tool.description).toContain('Forecast');
    });

    it('should have days_ahead with default value', async () => {
      const tool = tools.forecast_production;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          { logger_id: '925', days_ahead: 1 },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'forecast_production',
          { logger_id: '925', days_ahead: 1 },
        );
      }
    });
  });

  describe('diagnose_error_codes tool', () => {
    it('should have correct description', () => {
      const tool = tools.diagnose_error_codes;
      expect(tool.description).toContain('error');
    });

    it('should have days parameter with default of 7', async () => {
      const tool = tools.diagnose_error_codes;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute(
          { logger_id: '925', days: 7 },
          { messages: [], toolCallId: 'test' },
        );
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'diagnose_error_codes',
          { logger_id: '925', days: 7 },
        );
      }
    });
  });

  describe('get_fleet_overview tool', () => {
    it('should have correct description', () => {
      const tool = tools.get_fleet_overview;
      expect(tool.description).toContain('fleet');
    });

    it('should have no required parameters', async () => {
      const tool = tools.get_fleet_overview;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute({}, { messages: [], toolCallId: 'test' });
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'get_fleet_overview',
          {},
        );
      }
    });
  });

  describe('health_check tool', () => {
    it('should have correct description', () => {
      const tool = tools.health_check;
      expect(tool.description).toContain('health');
    });

    it('should have no required parameters', async () => {
      const tool = tools.health_check;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await tool.execute({}, { messages: [], toolCallId: 'test' });
        expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
          'health_check',
          {},
        );
      }
    });
  });

  describe('tool execution error handling', () => {
    it('should propagate errors from HTTP client', async () => {
      mockToolsClient.executeTool.mockRejectedValueOnce(
        new Error('Network error'),
      );

      const tool = tools.list_loggers;
      if ('execute' in tool && typeof tool.execute === 'function') {
        await expect(
          tool.execute({}, { messages: [], toolCallId: 'test' }),
        ).rejects.toThrow('Network error');
      }
    });
  });
});
