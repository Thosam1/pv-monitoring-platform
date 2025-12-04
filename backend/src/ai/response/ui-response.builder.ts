/**
 * UI Response Builder
 *
 * Validates and constructs render_ui_component tool call arguments.
 * Provides type-safe factory methods for each UI component, with runtime
 * validation via Zod schemas. Invalid props are caught on the backend
 * with clear error logs, preventing frontend crashes.
 */
import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { createRenderArgs } from '../flows/flow-utils';
import { AnySuggestion } from '../types/flow-state';
import {
  HealthReportSchema,
  FleetHealthReportSchema,
  FinancialReportSchema,
  FleetOverviewSchema,
  ComparisonChartSchema,
  DynamicChartSchema,
  PowerCurveSchema,
  ForecastChartSchema,
  type HealthReportProps,
  type FleetHealthReportProps,
  type FinancialReportProps,
  type FleetOverviewProps,
  type ComparisonChartProps,
  type DynamicChartProps,
  type PowerCurveProps,
  type ForecastChartProps,
} from './ui-schemas';

const logger = new Logger('UIResponseBuilder');

/**
 * UIResponseBuilder provides type-safe factory methods for constructing
 * render_ui_component tool call arguments with runtime validation.
 *
 * Benefits:
 * - TypeScript validates props at compile time
 * - Zod validates props at runtime
 * - Invalid props return ErrorCard instead of crashing frontend
 * - Centralized validation logic reduces code duplication
 *
 * @example
 * ```typescript
 * // Instead of:
 * args: createRenderArgs('HealthReport', props, suggestions)
 *
 * // Use:
 * args: UIResponseBuilder.healthReport(props, suggestions)
 * ```
 */
export class UIResponseBuilder {
  /**
   * Build HealthReport component args with validation.
   * Used for single logger health analysis.
   */
  static healthReport(
    props: HealthReportProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'HealthReport',
      HealthReportSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build FleetHealthReport component args with validation.
   * Used for all-devices health analysis.
   */
  static fleetHealthReport(
    props: FleetHealthReportProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'FleetHealthReport',
      FleetHealthReportSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build FinancialReport component args with validation.
   * Used for savings and forecast display.
   */
  static financialReport(
    props: FinancialReportProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'FinancialReport',
      FinancialReportSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build FleetOverview component args with validation.
   * Used for morning briefing dashboard.
   */
  static fleetOverview(
    props: FleetOverviewProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'FleetOverview',
      FleetOverviewSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build ComparisonChart component args with validation.
   * Legacy component - prefer DynamicChart for new implementations.
   */
  static comparisonChart(
    props: ComparisonChartProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'ComparisonChart',
      ComparisonChartSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build DynamicChart component args with validation.
   * Generative UI component for flexible chart rendering.
   */
  static dynamicChart(
    props: DynamicChartProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'DynamicChart',
      DynamicChartSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build PowerCurve component args with validation.
   * Used for power curve visualization.
   */
  static powerCurve(
    props: PowerCurveProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'PowerCurve',
      PowerCurveSchema,
      props,
      suggestions,
    );
  }

  /**
   * Build ForecastChart component args with validation.
   * Used for production forecast visualization.
   */
  static forecastChart(
    props: ForecastChartProps,
    suggestions: AnySuggestion[] = [],
  ): Record<string, unknown> {
    return this.validateAndBuild(
      'ForecastChart',
      ForecastChartSchema,
      props,
      suggestions,
    );
  }

  /**
   * Generic validation and build method.
   * Validates props against schema, returns ErrorCard on failure.
   *
   * @param componentName - Name of the component to render
   * @param schema - Zod schema for validation
   * @param props - Props to validate
   * @param suggestions - Suggestion chips to include
   * @returns Validated render args or ErrorCard args on failure
   */
  private static validateAndBuild<T extends z.ZodTypeAny>(
    componentName: string,
    schema: T,
    props: unknown,
    suggestions: AnySuggestion[],
  ): Record<string, unknown> {
    const result = schema.safeParse(props);

    if (!result.success) {
      const errors = result.error.issues.map(
        (i) => `${i.path.join('.')}: ${i.message}`,
      );
      logger.error(
        `[${componentName}] Validation failed: ${errors.join(', ')}`,
      );
      logger.debug(`Invalid props: ${JSON.stringify(props).slice(0, 500)}`);

      // Return error component instead of crashing
      return createRenderArgs(
        'ErrorCard',
        {
          title: 'Visualization Error',
          message: `Unable to render ${componentName}`,
          details: errors.slice(0, 3),
        },
        [],
      );
    }

    return createRenderArgs(
      componentName,
      result.data as Record<string, unknown>,
      suggestions,
    );
  }
}
