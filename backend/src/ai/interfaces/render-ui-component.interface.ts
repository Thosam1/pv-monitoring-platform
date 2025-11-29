/**
 * Props for the render_ui_component tool.
 *
 * CRITICAL: This tool is a PASS-THROUGH. The backend does NOT execute it.
 * The tool arguments are returned verbatim to the frontend for rendering.
 *
 * Component props must match the actual frontend component interfaces:
 * - PerformanceChart: PerformanceChartProps
 * - TechnicalChart: TechnicalChartProps
 * - KPIGrid: KPIGridProps
 * - AnomalyTable: Custom for AI anomaly display
 * - ComparisonChart: Custom for multi-logger comparison
 */

/**
 * Data point structure matching MeasurementDataPoint from frontend.
 */
export interface MeasurementDataPoint {
  timestamp: string; // ISO 8601
  activePowerWatts: number | null;
  energyDailyKwh: number | null;
  irradiance: number | null;
  metadata: Record<string, unknown>;
}

/**
 * Anomaly point for AnomalyTable component.
 */
export interface AnomalyPoint {
  timestamp: string;
  reason: string;
  activePowerWatts: number | null;
  irradiance: number | null;
}

/**
 * Comparison data point with dynamic logger keys.
 */
export interface ComparisonDataPoint {
  timestamp: string;
  [loggerId: string]: string | number | null;
}

/**
 * Props for PerformanceChart component.
 */
export interface PerformanceChartProps {
  data: MeasurementDataPoint[];
  chartStyle?: 'area' | 'line' | 'bar';
  showEnergy?: boolean;
  showIrradiance?: boolean;
  loggerId?: string;
  dateLabel?: string;
}

/**
 * Props for TechnicalChart component.
 */
export interface TechnicalChartProps {
  data: MeasurementDataPoint[];
  loggerId?: string;
  dateLabel?: string;
}

/**
 * Props for KPIGrid component.
 */
export interface KPIGridProps {
  data: MeasurementDataPoint[];
  loggerType?: string;
}

/**
 * Props for AnomalyTable component (AI-specific).
 */
export interface AnomalyTableProps {
  loggerId: string;
  anomalies: AnomalyPoint[];
  totalRecords?: number;
  daysAnalyzed?: number;
}

/**
 * Props for ComparisonChart component (AI-specific).
 */
export interface ComparisonChartProps {
  loggerIds: string[];
  metric: 'power' | 'energy' | 'irradiance';
  date?: string;
  data: ComparisonDataPoint[];
}

/**
 * Union type for all renderable components.
 */
export type RenderableComponent =
  | { component: 'PerformanceChart'; props: PerformanceChartProps }
  | { component: 'TechnicalChart'; props: TechnicalChartProps }
  | { component: 'KPIGrid'; props: KPIGridProps }
  | { component: 'AnomalyTable'; props: AnomalyTableProps }
  | { component: 'ComparisonChart'; props: ComparisonChartProps };

/**
 * Schema for the render_ui_component tool.
 */
export const RENDER_UI_COMPONENT_SCHEMA = {
  name: 'render_ui_component',
  description:
    'Render a UI component in the chat interface with data from analysis. ' +
    'Use this after calling analysis tools to visualize results.',
  parameters: {
    type: 'object',
    properties: {
      component: {
        type: 'string',
        enum: [
          'PerformanceChart',
          'TechnicalChart',
          'KPIGrid',
          'AnomalyTable',
          'ComparisonChart',
        ],
        description: 'The component to render',
      },
      props: {
        type: 'object',
        description:
          'Props to pass to the component (structure depends on component type)',
      },
    },
    required: ['component', 'props'],
  },
};
