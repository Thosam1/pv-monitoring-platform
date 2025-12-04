import { FlowArgumentSpec, FlowType } from '../types/flow-state';

/**
 * Argument specifications for each flow type.
 * Defines required and optional arguments with their types and default strategies.
 */
export const FLOW_ARGUMENT_SPECS: Record<FlowType, FlowArgumentSpec[]> = {
  health_check: [
    {
      name: 'loggerId',
      required: true,
      type: 'single_logger',
      description: 'Logger to analyze for health issues',
    },
    {
      name: 'dateRange',
      required: false,
      type: 'date_range',
      defaultStrategy: 'last_7_days',
      description: 'Analysis period (defaults to last 7 days)',
    },
  ],

  performance_audit: [
    {
      name: 'loggerIds',
      required: true,
      type: 'multiple_loggers',
      minCount: 2,
      maxCount: 5,
      description: 'Loggers to compare (2-5 required)',
    },
    {
      name: 'date',
      required: false,
      type: 'date',
      defaultStrategy: 'latest_date',
      description: 'Comparison date (defaults to latest available)',
    },
  ],

  financial_report: [
    {
      name: 'loggerId',
      required: true,
      type: 'single_logger',
      description: 'Logger for financial analysis',
    },
    {
      name: 'dateRange',
      required: false,
      type: 'date_range',
      defaultStrategy: 'last_7_days',
      description: 'Reporting period (defaults to last 7 days)',
    },
  ],

  // Morning briefing is fleet-level, no logger selection needed
  morning_briefing: [],

  // Free chat has no predefined argument requirements
  free_chat: [],

  // Greeting has no argument requirements
  greeting: [],
};

/**
 * Get the argument specification for a flow type.
 * @param flowType - The flow type to get specs for
 * @returns Array of argument specifications for the flow
 */
export function getFlowArgumentSpec(flowType: FlowType): FlowArgumentSpec[] {
  return FLOW_ARGUMENT_SPECS[flowType] || [];
}

/**
 * Check if a flow requires user input (has required arguments).
 * @param flowType - The flow type to check
 * @returns True if the flow has at least one required argument
 */
export function flowRequiresInput(flowType: FlowType): boolean {
  const specs = getFlowArgumentSpec(flowType);
  return specs.some((spec) => spec.required);
}

/**
 * Get the names of required arguments for a flow.
 * @param flowType - The flow type to check
 * @returns Array of required argument names
 */
export function getRequiredArgumentNames(flowType: FlowType): string[] {
  const specs = getFlowArgumentSpec(flowType);
  return specs.filter((spec) => spec.required).map((spec) => spec.name);
}

/**
 * Get the names of optional arguments with defaults for a flow.
 * @param flowType - The flow type to check
 * @returns Array of optional argument names that have default strategies
 */
export function getOptionalArgumentsWithDefaults(flowType: FlowType): string[] {
  const specs = getFlowArgumentSpec(flowType);
  return specs
    .filter(
      (spec) =>
        !spec.required &&
        spec.defaultStrategy &&
        spec.defaultStrategy !== 'none',
    )
    .map((spec) => spec.name);
}
