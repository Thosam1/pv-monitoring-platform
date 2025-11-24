import { useMemo } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import type { MeasurementDataPoint } from './KPIGrid'

interface TechnicalChartProps {
  data: MeasurementDataPoint[]
  isLoading?: boolean
  loggerId?: string | null
  dateLabel?: string | null
}

interface VoltageDataPoint {
  time: string
  timestamp: Date
  voltage: number | null
  temperature: number | null
}

// GoodWe voltage keys
const GOODWE_VOLTAGE_KEYS = ['pv1volt', 'voltagedc1', 'voltage_dc1', 'dcVoltage1', 'vpv1']
// LTI voltage keys
const LTI_VOLTAGE_KEYS = ['U_DC', 'voltage', 'dcVoltage', 'udc']
// Temperature keys
const TEMP_KEYS = ['temperature', 'T_HS', 'internaltemp', 'temp', 'moduleTemp']

/**
 * Extract voltage from metadata - handles both GoodWe and LTI formats
 */
function extractVoltage(metadata: Record<string, unknown>): number | null {
  // Try GoodWe keys first
  for (const key of GOODWE_VOLTAGE_KEYS) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }
  // Try LTI keys
  for (const key of LTI_VOLTAGE_KEYS) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }
  return null
}

/**
 * Extract temperature from metadata
 */
function extractTemperature(metadata: Record<string, unknown>): number | null {
  for (const key of TEMP_KEYS) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }
  return null
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

export function TechnicalChart({ data, isLoading, loggerId, dateLabel }: Readonly<TechnicalChartProps>) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []

    const transformed: VoltageDataPoint[] = data.map((m) => ({
      time: formatTime(m.timestamp),
      timestamp: m.timestamp,
      voltage: extractVoltage(m.metadata),
      temperature: extractTemperature(m.metadata)
    }))

    // Sort by timestamp
    transformed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    // Sample data if too many points
    const maxPoints = 150
    if (transformed.length > maxPoints) {
      const step = Math.ceil(transformed.length / maxPoints)
      return transformed.filter((_, i) => i % step === 0)
    }

    return transformed
  }, [data])

  // Check if we have any voltage or temperature data
  const hasVoltageData = chartData.some((d) => d.voltage !== null)
  const hasTempData = chartData.some((d) => d.temperature !== null)

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (chartData.length === 0 || (!hasVoltageData && !hasTempData)) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-sm">No technical data available</p>
          <p className="text-xs mt-1">Voltage/temperature data not found in metadata</p>
        </div>
      </div>
    )
  }

  // Build chart title with context
  const chartTitle = [
    'Technical Metrics',
    loggerId && `• ${loggerId}`,
    dateLabel && `• ${dateLabel}`
  ].filter(Boolean).join(' ')

  return (
    <div className="h-full bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 truncate" title={chartTitle}>
        {chartTitle}
      </h3>
      <div className="h-[calc(100%-2rem)]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#9CA3AF"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            {hasVoltageData && (
              <YAxis
                yAxisId="voltage"
                stroke="#8B5CF6"
                unit=" V"
                tick={{ fontSize: 10 }}
                width={50}
                domain={['auto', 'auto']}
              />
            )}
            {hasTempData && (
              <YAxis
                yAxisId="temp"
                orientation={hasVoltageData ? 'right' : 'left'}
                stroke="#EF4444"
                unit=" °C"
                tick={{ fontSize: 10 }}
                width={50}
                domain={['auto', 'auto']}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: 'none',
                borderRadius: '8px',
                color: '#F9FAFB',
                fontSize: '12px'
              }}
              formatter={(value, name: string) => {
                if (value === null || value === undefined) return ['--', name]
                const numValue = Number(value)
                if (name === 'voltage') return [`${numValue.toFixed(1)} V`, 'DC Voltage']
                if (name === 'temperature') return [`${numValue.toFixed(1)} °C`, 'Temperature']
                return [String(value), name]
              }}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend />

            {hasVoltageData && (
              <Line
                yAxisId="voltage"
                type="monotone"
                dataKey="voltage"
                name="voltage"
                stroke="#8B5CF6"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {hasTempData && (
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temperature"
                name="temperature"
                stroke="#EF4444"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
