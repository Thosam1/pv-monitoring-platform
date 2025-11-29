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
 * - DynamicChart: Generative UI chart with full configuration
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
 * Series configuration for DynamicChart.
 */
export interface ChartSeries {
  dataKey: string;
  name: string;
  type?: 'area' | 'bar' | 'line' | 'scatter';
  color?: string;
  yAxisId?: 'left' | 'right';
  fillOpacity?: number;
}

/**
 * Props for DynamicChart component (Generative UI).
 * Enables AI to generate fully configurable charts on-the-fly.
 */
export interface DynamicChartProps {
  chartType: 'area' | 'bar' | 'line' | 'scatter' | 'pie' | 'composed';
  title: string;
  xAxisKey: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  series: ChartSeries[];
  data: Record<string, unknown>[];
  showLegend?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
}

/**
 * Union type for all renderable components.
 */
export type RenderableComponent =
  | { component: 'PerformanceChart'; props: PerformanceChartProps }
  | { component: 'TechnicalChart'; props: TechnicalChartProps }
  | { component: 'KPIGrid'; props: KPIGridProps }
  | { component: 'AnomalyTable'; props: AnomalyTableProps }
  | { component: 'ComparisonChart'; props: ComparisonChartProps }
  | { component: 'DynamicChart'; props: DynamicChartProps };

/**
 * Schema for the render_ui_component tool.
 */
export const RENDER_UI_COMPONENT_SCHEMA = {
  name: 'render_ui_component',
  description:
    'Render a UI component in the chat interface with data from analysis. ' +
    'Use this after calling analysis tools to visualize results. ' +
    'Use DynamicChart for flexible chart generation with full control over type, series, and styling.',
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
          'DynamicChart',
        ],
        description:
          'The component to render. Use DynamicChart for AI-generated visualizations with customizable chart types.',
      },
      props: {
        type: 'object',
        description:
          'Props to pass to the component. For DynamicChart: { chartType, title, xAxisKey, series: [{dataKey, name, color?, yAxisId?}], data: [...] }',
      },
    },
    required: ['component', 'props'],
  },
};
