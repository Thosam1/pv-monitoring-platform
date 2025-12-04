import { useMemo, useState, useEffect } from 'react'
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import type { ChartStyle } from './DashboardControls'
import type { MeasurementDataPoint } from './KPIGrid'

interface DataDateRange {
  earliest: Date
  latest: Date
}

interface PerformanceChartProps {
  data: MeasurementDataPoint[]
  chartStyle: ChartStyle
  showEnergy: boolean
  showIrradiance: boolean
  isLoading?: boolean
  loggerId?: string | null
  dateLabel?: string | null
  dataDateRange?: DataDateRange | null
  onDateSelect?: (date: string) => void
}

interface ChartDataPoint {
  time: string
  timestamp: Date
  power: number
  energy: number
  irradiance: number
}

/**
 * Format timestamp to HH:mm for X-axis
 */
function formatTime(timestamp: Date): string {
  return timestamp.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

/**
 * Format a date for display
 */
function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  })
}

/**
 * Format a date to yyyy-MM-dd for the date picker (uses UTC to avoid timezone shifts)
 */
function formatDateForPicker(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PerformanceChart({
  data,
  chartStyle,
  showEnergy,
  showIrradiance,
  isLoading,
  loggerId,
  dateLabel,
  dataDateRange,
  onDateSelect,
}: Readonly<PerformanceChartProps>) {
  // Delay chart rendering to avoid Recharts dimension warnings
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []

    const transformed: ChartDataPoint[] = data.map((m) => ({
      time: formatTime(m.timestamp),
      timestamp: m.timestamp,
      power: m.activePowerWatts ?? 0,
      energy: m.energyDailyKwh ?? 0,
      irradiance: m.irradiance ?? 0
    }))

    // Sort by timestamp
    transformed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    // Sample data if too many points (for performance)
    const maxPoints = 200
    if (transformed.length > maxPoints) {
      const step = Math.ceil(transformed.length / maxPoints)
      return transformed.filter((_, i) => i % step === 0)
    }

    return transformed
  }, [data])

  if (isLoading || !isReady) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-gray-500 dark:text-gray-400">Loading chart...</div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="mb-2">No measurement data available for selected date</p>
          {dataDateRange ? (
            <p className="text-sm">
              Data available from{' '}
              <button
                type="button"
                onClick={() => onDateSelect?.(formatDateForPicker(dataDateRange.earliest))}
                className="font-medium text-blue-500 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
              >
                {formatDateDisplay(dataDateRange.earliest)}
              </button>
              {' '}to{' '}
              <button
                type="button"
                onClick={() => onDateSelect?.(formatDateForPicker(dataDateRange.latest))}
                className="font-medium text-blue-500 hover:text-blue-600 hover:underline cursor-pointer transition-colors"
              >
                {formatDateDisplay(dataDateRange.latest)}
              </button>
            </p>
          ) : (
            <p className="text-sm">Upload CSV files to see the chart</p>
          )}
        </div>
      </div>
    )
  }

  // Check if power data exists (meteo stations have null power)
  const hasPowerData = data.some((d) => d.activePowerWatts !== null)

  // Check if irradiance data exists
  const hasIrradianceData = chartData.some((d) => d.irradiance > 0)

  // Determine if this is an irradiance-only view (meteo stations)
  const isIrradianceOnlyView = !hasPowerData && hasIrradianceData

  // Secondary axis is needed if showing energy or irradiance (and we have power data)
  const hasSecondaryAxis = hasPowerData && (showEnergy || showIrradiance)

  // Build chart title with context
  const chartTitle = [
    isIrradianceOnlyView ? 'Irradiance Overview' : 'Performance Overview',
    loggerId && `• ${loggerId}`,
    dateLabel && `• ${dateLabel}`
  ].filter(Boolean).join(' ')

  return (
    <div className="h-full bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {chartTitle}
        </h3>
        {showIrradiance && !hasIrradianceData && (
          <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded">
            No irradiance data
          </span>
        )}
      </div>
      <div className="h-[calc(100%-3rem)]">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#9CA3AF"
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              yAxisId="left"
              stroke={isIrradianceOnlyView ? '#EAB308' : '#F59E0B'}
              unit={isIrradianceOnlyView ? ' W/m²' : ' W'}
              tick={{ fontSize: 11 }}
              width={70}
              domain={[0, 'auto']}
              allowDataOverflow={true}
            />
            {hasSecondaryAxis && (
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke={showEnergy ? '#3B82F6' : '#EAB308'}
                unit={showEnergy ? ' kWh' : ' W/m²'}
                tick={{ fontSize: 11 }}
                width={70}
                domain={[0, 'auto']}
                allowDataOverflow={true}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: 'none',
                borderRadius: '8px',
                color: '#F9FAFB'
              }}
              formatter={(value: number, name: string) => {
                if (name === 'power') return [`${value.toFixed(1)} W`, 'Power']
                if (name === 'energy') return [`${value.toFixed(2)} kWh`, 'Energy']
                if (name === 'irradiance') return [`${value.toFixed(0)} W/m²`, 'Irradiance']
                return [value, name]
              }}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend />

            {/* Irradiance-Only Mode (Meteo Stations) - Irradiance as Primary */}
            {isIrradianceOnlyView && chartStyle === 'area' && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="irradiance"
                name="irradiance"
                stroke="#EAB308"
                fill="#EAB308"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            )}
            {isIrradianceOnlyView && chartStyle === 'line' && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="irradiance"
                name="irradiance"
                stroke="#EAB308"
                strokeWidth={2}
                dot={false}
              />
            )}
            {isIrradianceOnlyView && chartStyle === 'bar' && (
              <Bar
                yAxisId="left"
                dataKey="irradiance"
                name="irradiance"
                fill="#EAB308"
                fillOpacity={0.8}
              />
            )}

            {/* Normal Mode - Power as Primary */}
            {!isIrradianceOnlyView && chartStyle === 'area' && (
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="power"
                name="power"
                stroke="#F59E0B"
                fill="#F59E0B"
                fillOpacity={0.3}
                strokeWidth={2}
              />
            )}
            {!isIrradianceOnlyView && chartStyle === 'line' && (
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="power"
                name="power"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
              />
            )}
            {!isIrradianceOnlyView && chartStyle === 'bar' && (
              <Bar
                yAxisId="left"
                dataKey="power"
                name="power"
                fill="#F59E0B"
                fillOpacity={0.8}
              />
            )}

            {/* Secondary Metric - Energy (only in normal mode) */}
            {!isIrradianceOnlyView && showEnergy && (
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="energy"
                name="energy"
                stroke="#3B82F6"
                strokeWidth={2}
                dot={false}
                strokeDasharray="5 5"
              />
            )}

            {/* Secondary Metric - Irradiance (only in normal mode when toggled) */}
            {!isIrradianceOnlyView && showIrradiance && (
              <Line
                yAxisId={showEnergy ? 'left' : 'right'}
                type="monotone"
                dataKey="irradiance"
                name="irradiance"
                stroke="#EAB308"
                strokeWidth={2}
                dot={false}
                strokeDasharray="3 3"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
