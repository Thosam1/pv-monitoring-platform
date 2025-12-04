/**
 * UI Response Module
 *
 * Provides type-safe builders for render_ui_component tool call arguments.
 *
 * @example
 * ```typescript
 * import { UIResponseBuilder } from '../response';
 *
 * // Build validated HealthReport args
 * const args = UIResponseBuilder.healthReport({
 *   loggerId: '925',
 *   healthScore: 95,
 *   anomalies: [],
 * }, suggestions);
 * ```
 */
export * from './ui-schemas';
export * from './ui-response.builder';
