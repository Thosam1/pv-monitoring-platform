import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  LineChart,
  ScatterChart,
  PieChart,
  Area,
  Bar,
  Line,
  Scatter,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'

/**
 * Solar-themed color palette for charts.
 */
const CHART_COLORS = [
  '#FDB813', // Solar yellow (primary)
  '#3B82F6', // Blue (irradiance)
  '#22C55E', // Green (energy)
  '#EF4444', // Red (alerts)
  '#8B5CF6', // Purple
  '#F97316', // Orange
  '#06B6D4', // Cyan
  '#EC4899', // Pink
]

/**
 * Series configuration for dynamic charts.
 */
export interface ChartSeries {
  dataKey: string
  name: string
  type?: 'area' | 'bar' | 'line' | 'scatter'
  color?: string
  yAxisId?: 'left' | 'right'
  fillOpacity?: number
}

/**
 * Props for the DynamicChart component.
 * Enables AI to generate fully configurable charts on-the-fly.
 */
export interface DynamicChartProps {
  chartType: 'area' | 'bar' | 'line' | 'scatter' | 'pie' | 'composed'
  title: string
  xAxisKey: string
  xAxisLabel?: string
  yAxisLabel?: string
  series: ChartSeries[]
  data: Record<string, unknown>[]
  showLegend?: boolean
  showGrid?: boolean
  showTooltip?: boolean
}

/**
 * Format timestamp for display (handles ISO strings).
 */
function formatTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    // Try to parse as ISO date
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    }
    return value
  }
  return String(value)
}

/**
 * DynamicChart - AI-generated chart component with full configuration control.
 *
 * Supports 6 chart types: area, bar, line, scatter, pie, composed
 * Used by the AI to render visualizations based on data from MCP tools.
 */
export function DynamicChart({
  chartType,
  title,
  xAxisKey,
  xAxisLabel,
  yAxisLabel,
  series,
  data,
  showLegend = true,
  showGrid = true,
  showTooltip = true,
}: Readonly<DynamicChartProps>) {
  // Render series elements based on type
  const renderSeries = (s: ChartSeries, index: number) => {
    const color = s.color || CHART_COLORS[index % CHART_COLORS.length]
    const type = s.type || chartType
    const yAxisId = s.yAxisId || 'left'

    switch (type) {
      case 'area':
        return (
          <Area
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            yAxisId={yAxisId}
            fill={color}
            stroke={color}
            fillOpacity={s.fillOpacity ?? 0.3}
            strokeWidth={2}
            type="monotone"
          />
        )
      case 'bar':
        return (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            yAxisId={yAxisId}
            fill={color}
            fillOpacity={0.8}
          />
        )
      case 'line':
        return (
          <Line
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            yAxisId={yAxisId}
            stroke={color}
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        )
      case 'scatter':
        return (
          <Scatter
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={color}
          />
        )
      default:
        return (
          <Line
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            yAxisId={yAxisId}
            stroke={color}
            strokeWidth={2}
            dot={false}
            type="monotone"
          />
        )
    }
  }

  // Determine if we need dual Y-axis
  const hasRightAxis = series.some((s) => s.yAxisId === 'right')

  // Empty data state
  if (!data || data.length === 0) {
    return (
      <div className="h-[350px] w-full rounded-lg border bg-card p-4 flex items-center justify-center">
        <p className="text-muted-foreground">No data available for chart</p>
      </div>
    )
  }

  // Common chart children (shared between chart types)
  const chartChildren = (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />}
      <XAxis
        dataKey={xAxisKey}
        stroke="#9CA3AF"
        tick={{ fontSize: 11 }}
        tickFormatter={formatTimestamp}
        interval="preserveStartEnd"
        label={
          xAxisLabel
            ? { value: xAxisLabel, position: 'insideBottom', offset: -5, fontSize: 12 }
            : undefined
        }
      />
      <YAxis
        yAxisId="left"
        stroke="#9CA3AF"
        tick={{ fontSize: 11 }}
        width={60}
        domain={[0, 'auto']}
        label={
          yAxisLabel
            ? { value: yAxisLabel, angle: -90, position: 'insideLeft', fontSize: 12 }
            : undefined
        }
      />
      {hasRightAxis && (
        <YAxis
          yAxisId="right"
          orientation="right"
          stroke="#9CA3AF"
          tick={{ fontSize: 11 }}
          width={60}
          domain={[0, 'auto']}
        />
      )}
      {showTooltip && (
        <Tooltip
          contentStyle={{
            backgroundColor: '#1F2937',
            border: 'none',
            borderRadius: '8px',
            color: '#F9FAFB',
          }}
          labelFormatter={(label) => formatTimestamp(label)}
        />
      )}
      {showLegend && <Legend />}
      {series.map(renderSeries)}
    </>
  )

  // Select chart component based on type
  const ChartComponent = {
    area: AreaChart,
    bar: BarChart,
    line: LineChart,
    scatter: ScatterChart,
    composed: ComposedChart,
    pie: PieChart,
  }[chartType] || ComposedChart

  // Special handling for pie charts
  if (chartType === 'pie') {
    const dataKey = series[0]?.dataKey || 'value'
    return (
      <div className="h-[350px] w-full rounded-lg border bg-card p-4">
        <h3 className="mb-2 font-semibold text-foreground">{title}</h3>
        <div className="h-[calc(100%-2rem)]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey={dataKey}
                nameKey={xAxisKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={true}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              {showTooltip && (
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1F2937',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#F9FAFB',
                  }}
                />
              )}
              {showLegend && <Legend />}
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    )
  }

  // Standard Cartesian charts (area, bar, line, scatter, composed)
  return (
    <div className="h-[350px] w-full rounded-lg border bg-card p-4">
      <h3 className="mb-2 font-semibold text-foreground">{title}</h3>
      <div className="h-[calc(100%-2rem)]">
        <ResponsiveContainer width="100%" height="100%">
          <ChartComponent data={data}>{chartChildren}</ChartComponent>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
