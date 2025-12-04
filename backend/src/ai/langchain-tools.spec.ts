/**
 * Unit tests for langchain-tools.ts
 *
 * Tests LangChain tool definitions for solar analyst.
 */
import {
  createLangChainTools,
  createUiTools,
  getAllTools,
} from './langchain-tools';
import { createMockToolsClient, MOCK_LIST_LOGGERS } from './test-utils';

/**
 * Type for parsed passthrough tool responses.
 */
interface PassthroughResponse {
  _passthrough: boolean;
  component?: string;
  props?: Record<string, unknown>;
  suggestions?: unknown[];
  prompt?: string;
  options?: unknown[];
  selectionType?: string;
  inputType?: string;
  minDate?: string;
  maxDate?: string;
  flowHint?: unknown;
}

describe('createLangChainTools', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
  });

  it('should return an array of tools', () => {
    const tools = createLangChainTools(mockToolsClient as never);
    expect(Array.isArray(tools)).toBe(true);
  });

  it('should return 10 tools', () => {
    const tools = createLangChainTools(mockToolsClient as never);
    expect(tools).toHaveLength(10);
  });

  it('should include all expected tool names', () => {
    const tools = createLangChainTools(mockToolsClient as never);
    const toolNames = tools.map((t) => t.name);

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

  describe('tool structure', () => {
    it('should have name property on each tool', () => {
      const tools = createLangChainTools(mockToolsClient as never);
      tools.forEach((tool) => {
        expect(tool.name).toBeDefined();
        expect(typeof tool.name).toBe('string');
      });
    });

    it('should have description property on each tool', () => {
      const tools = createLangChainTools(mockToolsClient as never);
      tools.forEach((tool) => {
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
      });
    });

    it('should have schema property on each tool', () => {
      const tools = createLangChainTools(mockToolsClient as never);
      tools.forEach((tool) => {
        expect(tool.schema).toBeDefined();
      });
    });
  });

  describe('tool execution', () => {
    it('should call HTTP client and return JSON string for list_loggers', async () => {
      mockToolsClient.executeTool.mockResolvedValueOnce(MOCK_LIST_LOGGERS);

      const tools = createLangChainTools(mockToolsClient as never);
      const listLoggersTool = tools.find((t) => t.name === 'list_loggers');

      expect(listLoggersTool).toBeDefined();
      const result = (await listLoggersTool!.invoke({})) as string;

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'list_loggers',
        {},
      );
      expect(typeof result).toBe('string');
      expect(JSON.parse(result)).toEqual(MOCK_LIST_LOGGERS);
    });

    it('should call HTTP client with args for analyze_inverter_health', async () => {
      const tools = createLangChainTools(mockToolsClient as never);
      const healthTool = tools.find(
        (t) => t.name === 'analyze_inverter_health',
      );

      await healthTool?.invoke({ logger_id: '925', days: 7 });

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'analyze_inverter_health',
        { logger_id: '925', days: 7 },
      );
    });

    it('should call HTTP client with args for get_power_curve', async () => {
      const tools = createLangChainTools(mockToolsClient as never);
      const powerCurveTool = tools.find((t) => t.name === 'get_power_curve');

      await powerCurveTool?.invoke({ logger_id: '925', date: '2025-01-15' });

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'get_power_curve',
        { logger_id: '925', date: '2025-01-15' },
      );
    });

    it('should call HTTP client with args for compare_loggers', async () => {
      const tools = createLangChainTools(mockToolsClient as never);
      const compareTool = tools.find((t) => t.name === 'compare_loggers');

      await compareTool?.invoke({
        logger_ids: ['925', '926'],
        metric: 'power',
        date: '2025-01-15',
      });

      expect(mockToolsClient.executeTool).toHaveBeenCalledWith(
        'compare_loggers',
        { logger_ids: ['925', '926'], metric: 'power', date: '2025-01-15' },
      );
    });
  });
});

describe('createUiTools', () => {
  it('should return an array of 2 tools', () => {
    const tools = createUiTools();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools).toHaveLength(2);
  });

  it('should include render_ui_component tool', () => {
    const tools = createUiTools();
    const renderTool = tools.find((t) => t.name === 'render_ui_component');
    expect(renderTool).toBeDefined();
  });

  it('should include request_user_selection tool', () => {
    const tools = createUiTools();
    const selectionTool = tools.find(
      (t) => t.name === 'request_user_selection',
    );
    expect(selectionTool).toBeDefined();
  });

  describe('render_ui_component tool', () => {
    it('should have correct description', () => {
      const tools = createUiTools();
      const renderTool = tools.find((t) => t.name === 'render_ui_component');
      expect(renderTool?.description).toContain('Render');
      expect(renderTool?.description).toContain('charts');
    });

    it('should return JSON with _passthrough flag', async () => {
      const tools = createUiTools();
      const renderTool = tools.find((t) => t.name === 'render_ui_component');

      expect(renderTool).toBeDefined();
      const result = (await renderTool!.invoke({
        component: 'DynamicChart',
        props: { chartType: 'line', data: [] },
      })) as string;

      const parsed = JSON.parse(result) as PassthroughResponse;
      expect(parsed._passthrough).toBe(true);
      expect(parsed.component).toBe('DynamicChart');
    });

    it('should include suggestions in response', async () => {
      const tools = createUiTools();
      const renderTool = tools.find((t) => t.name === 'render_ui_component');

      const suggestions = [
        { label: 'Test', action: 'Do test', priority: 'primary' },
      ];
      expect(renderTool).toBeDefined();
      const result = (await renderTool!.invoke({
        component: 'FleetOverview',
        props: {},
        suggestions,
      })) as string;

      const parsed = JSON.parse(result) as PassthroughResponse;
      expect(parsed.suggestions).toEqual(suggestions);
    });
  });

  describe('request_user_selection tool', () => {
    it('should have correct description', () => {
      const tools = createUiTools();
      const selectionTool = tools.find(
        (t) => t.name === 'request_user_selection',
      );
      expect(selectionTool?.description).toContain('Request user');
      expect(selectionTool?.description).toContain('select');
    });

    it('should return JSON with _passthrough flag', async () => {
      const tools = createUiTools();
      const selectionTool = tools.find(
        (t) => t.name === 'request_user_selection',
      );

      expect(selectionTool).toBeDefined();
      const result = (await selectionTool!.invoke({
        prompt: 'Select a logger:',
        options: [{ value: '925', label: 'Logger 925' }],
        selectionType: 'single',
        inputType: 'dropdown',
      })) as string;

      const parsed = JSON.parse(result) as PassthroughResponse;
      expect(parsed._passthrough).toBe(true);
      expect(parsed.prompt).toBe('Select a logger:');
    });

    it('should include flowHint in response', async () => {
      const tools = createUiTools();
      const selectionTool = tools.find(
        (t) => t.name === 'request_user_selection',
      );

      const flowHint = {
        expectedNext: 'Will analyze health',
        skipOption: { label: 'Skip', action: 'Use default' },
      };
      expect(selectionTool).toBeDefined();
      const result = (await selectionTool!.invoke({
        prompt: 'Select:',
        options: [],
        selectionType: 'single',
        inputType: 'dropdown',
        flowHint,
      })) as string;

      const parsed = JSON.parse(result) as PassthroughResponse;
      expect(parsed.flowHint).toEqual(flowHint);
    });

    it('should include date range fields', async () => {
      const tools = createUiTools();
      const selectionTool = tools.find(
        (t) => t.name === 'request_user_selection',
      );

      expect(selectionTool).toBeDefined();
      const result = (await selectionTool!.invoke({
        prompt: 'Select date:',
        options: [],
        selectionType: 'single',
        inputType: 'date',
        minDate: '2024-01-01',
        maxDate: '2025-01-15',
      })) as string;

      const parsed = JSON.parse(result) as PassthroughResponse;
      expect(parsed.minDate).toBe('2024-01-01');
      expect(parsed.maxDate).toBe('2025-01-15');
      expect(parsed.inputType).toBe('date');
    });
  });
});

describe('getAllTools', () => {
  let mockToolsClient: ReturnType<typeof createMockToolsClient>;

  beforeEach(() => {
    mockToolsClient = createMockToolsClient();
  });

  it('should combine LangChain tools and UI tools', () => {
    const allTools = getAllTools(mockToolsClient as never);

    // 10 LangChain tools + 2 UI tools = 12 total
    expect(allTools).toHaveLength(12);
  });

  it('should include both solar analyst and UI tools', () => {
    const allTools = getAllTools(mockToolsClient as never);
    const toolNames = allTools.map((t) => t.name);

    // Solar analyst tools
    expect(toolNames).toContain('list_loggers');
    expect(toolNames).toContain('get_fleet_overview');

    // UI tools
    expect(toolNames).toContain('render_ui_component');
    expect(toolNames).toContain('request_user_selection');
  });
});
