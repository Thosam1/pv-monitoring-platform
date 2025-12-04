/**
 * Unit tests for flow-argument-specs.ts
 *
 * Tests the flow argument specification functions and FLOW_ARGUMENT_SPECS constant.
 */
import {
  FLOW_ARGUMENT_SPECS,
  getFlowArgumentSpec,
  flowRequiresInput,
  getRequiredArgumentNames,
  getOptionalArgumentsWithDefaults,
} from './flow-argument-specs';
import { FlowType } from '../types/flow-state';

describe('FLOW_ARGUMENT_SPECS', () => {
  it('should have specs for all flow types', () => {
    const flowTypes: FlowType[] = [
      'health_check',
      'performance_audit',
      'financial_report',
      'morning_briefing',
      'free_chat',
      'greeting',
    ];

    flowTypes.forEach((flowType) => {
      expect(FLOW_ARGUMENT_SPECS[flowType]).toBeDefined();
      expect(Array.isArray(FLOW_ARGUMENT_SPECS[flowType])).toBe(true);
    });
  });

  it('should have correct spec structure for health_check', () => {
    const specs = FLOW_ARGUMENT_SPECS['health_check'];
    expect(specs).toHaveLength(2);

    const loggerIdSpec = specs.find((s) => s.name === 'loggerId');
    expect(loggerIdSpec).toEqual({
      name: 'loggerId',
      required: true,
      type: 'single_logger',
      description: 'Logger to analyze for health issues',
    });

    const dateRangeSpec = specs.find((s) => s.name === 'dateRange');
    expect(dateRangeSpec).toEqual({
      name: 'dateRange',
      required: false,
      type: 'date_range',
      defaultStrategy: 'last_7_days',
      description: 'Analysis period (defaults to last 7 days)',
    });
  });

  it('should have correct spec structure for performance_audit', () => {
    const specs = FLOW_ARGUMENT_SPECS['performance_audit'];
    expect(specs).toHaveLength(2);

    const loggerIdsSpec = specs.find((s) => s.name === 'loggerIds');
    expect(loggerIdsSpec).toMatchObject({
      name: 'loggerIds',
      required: true,
      type: 'multiple_loggers',
      minCount: 2,
      maxCount: 5,
    });
  });

  it('should have empty specs for morning_briefing', () => {
    expect(FLOW_ARGUMENT_SPECS['morning_briefing']).toEqual([]);
  });

  it('should have empty specs for free_chat', () => {
    expect(FLOW_ARGUMENT_SPECS['free_chat']).toEqual([]);
  });

  it('should have empty specs for greeting', () => {
    expect(FLOW_ARGUMENT_SPECS['greeting']).toEqual([]);
  });
});

describe('getFlowArgumentSpec', () => {
  it('should return specs for health_check', () => {
    const specs = getFlowArgumentSpec('health_check');
    expect(specs).toHaveLength(2);
    expect(specs[0].name).toBe('loggerId');
  });

  it('should return specs for performance_audit', () => {
    const specs = getFlowArgumentSpec('performance_audit');
    expect(specs).toHaveLength(2);
    expect(specs[0].name).toBe('loggerIds');
  });

  it('should return specs for financial_report', () => {
    const specs = getFlowArgumentSpec('financial_report');
    expect(specs).toHaveLength(2);
    expect(specs[0].name).toBe('loggerId');
  });

  it('should return empty array for morning_briefing', () => {
    const specs = getFlowArgumentSpec('morning_briefing');
    expect(specs).toEqual([]);
  });

  it('should return empty array for free_chat', () => {
    const specs = getFlowArgumentSpec('free_chat');
    expect(specs).toEqual([]);
  });

  it('should return empty array for greeting', () => {
    const specs = getFlowArgumentSpec('greeting');
    expect(specs).toEqual([]);
  });

  it('should return empty array for unknown flow type', () => {
    // Cast to bypass TypeScript check for unknown flow type
    const specs = getFlowArgumentSpec('unknown_flow' as FlowType);
    expect(specs).toEqual([]);
  });
});

describe('flowRequiresInput', () => {
  it('should return true for health_check (has required loggerId)', () => {
    expect(flowRequiresInput('health_check')).toBe(true);
  });

  it('should return true for performance_audit (has required loggerIds)', () => {
    expect(flowRequiresInput('performance_audit')).toBe(true);
  });

  it('should return true for financial_report (has required loggerId)', () => {
    expect(flowRequiresInput('financial_report')).toBe(true);
  });

  it('should return false for morning_briefing (no required args)', () => {
    expect(flowRequiresInput('morning_briefing')).toBe(false);
  });

  it('should return false for free_chat (no required args)', () => {
    expect(flowRequiresInput('free_chat')).toBe(false);
  });

  it('should return false for greeting (no required args)', () => {
    expect(flowRequiresInput('greeting')).toBe(false);
  });

  it('should return false for unknown flow type', () => {
    expect(flowRequiresInput('unknown_flow' as FlowType)).toBe(false);
  });
});

describe('getRequiredArgumentNames', () => {
  it('should return ["loggerId"] for health_check', () => {
    const names = getRequiredArgumentNames('health_check');
    expect(names).toEqual(['loggerId']);
  });

  it('should return ["loggerIds"] for performance_audit', () => {
    const names = getRequiredArgumentNames('performance_audit');
    expect(names).toEqual(['loggerIds']);
  });

  it('should return ["loggerId"] for financial_report', () => {
    const names = getRequiredArgumentNames('financial_report');
    expect(names).toEqual(['loggerId']);
  });

  it('should return empty array for morning_briefing', () => {
    const names = getRequiredArgumentNames('morning_briefing');
    expect(names).toEqual([]);
  });

  it('should return empty array for free_chat', () => {
    const names = getRequiredArgumentNames('free_chat');
    expect(names).toEqual([]);
  });

  it('should return empty array for greeting', () => {
    const names = getRequiredArgumentNames('greeting');
    expect(names).toEqual([]);
  });
});

describe('getOptionalArgumentsWithDefaults', () => {
  it('should return ["dateRange"] for health_check', () => {
    const names = getOptionalArgumentsWithDefaults('health_check');
    expect(names).toEqual(['dateRange']);
  });

  it('should return ["date"] for performance_audit', () => {
    const names = getOptionalArgumentsWithDefaults('performance_audit');
    expect(names).toEqual(['date']);
  });

  it('should return ["dateRange"] for financial_report', () => {
    const names = getOptionalArgumentsWithDefaults('financial_report');
    expect(names).toEqual(['dateRange']);
  });

  it('should return empty array for morning_briefing', () => {
    const names = getOptionalArgumentsWithDefaults('morning_briefing');
    expect(names).toEqual([]);
  });

  it('should return empty array for free_chat', () => {
    const names = getOptionalArgumentsWithDefaults('free_chat');
    expect(names).toEqual([]);
  });

  it('should return empty array for greeting', () => {
    const names = getOptionalArgumentsWithDefaults('greeting');
    expect(names).toEqual([]);
  });

  it('should return empty array for unknown flow type', () => {
    const names = getOptionalArgumentsWithDefaults('unknown_flow' as FlowType);
    expect(names).toEqual([]);
  });
});
