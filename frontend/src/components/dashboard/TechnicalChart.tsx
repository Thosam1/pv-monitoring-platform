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

interface TechnicalDataPoint {
  time: string
  timestamp: Date
  voltageDC: number | null
  voltageAC: number | null
  currentDC: number | null
  currentAC: number | null
  temperature: number | null
  reactivePower: number | null
  windSpeed: number | null
  frequency: number | null
}

// DC Voltage keys (expanded for all logger types)
const VOLTAGE_DC_KEYS = [
  'voltageDC', 'U_DC', 'vdc',                    // Normalized + common
  'pv1volt', 'voltagedc1', 'voltage_dc1',        // GoodWe variants
  'dcVoltage1', 'vpv1', 'dcVoltage', 'udc'       // Other variants
]

// AC Voltage keys
const VOLTAGE_AC_KEYS = ['voltageAC', 'U_AC', 'vac', 'gridVoltage', 'acVoltage']

// DC Current keys
const CURRENT_DC_KEYS = ['currentDC', 'I_DC', 'idc', 'pv1curr', 'dcCurrent', 'ipv1']

// AC Current keys
const CURRENT_AC_KEYS = ['currentAC', 'I_AC', 'iac', 'gridCurrent', 'acCurrent']

// Temperature keys (expanded with normalized keys and directional variants)
const TEMPERATURE_KEYS = [
  'ambientTemperature',        // Priority 1: Ambient
  'ambientTemperatureWest',    // MBMET directional variant
  'ambientTemperatureEast',    // MBMET directional variant
  'cellTemperature',           // Priority 2: Cell/Module
  'cellTemperatureWest',       // MBMET directional variant
  'cellTemperatureEast',       // MBMET directional variant
  'temperatureHeatsink',       // Priority 3: Heatsink
  'temperatureInternal',       // Priority 4: Internal
  'temperature', 'T_HS',       // Legacy keys
  'internaltemp', 'temp', 'moduleTemp'
]

// Reactive Power keys
const REACTIVE_POWER_KEYS = ['reactivePowerVar', 'Q', 'var', 'reactivePower']

// Wind Speed keys
const WIND_SPEED_KEYS = ['windSpeed', 'wind', 'windVelocity']

// Grid Frequency keys (Hz)
const FREQUENCY_KEYS = ['fac', 'frequency', 'gridFrequency', 'freq', 'f_ac']

/**
 * Generic metadata value extractor
 */
function extractValue(metadata: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }
  return null
}

/**
 * Extract DC voltage from metadata
 */
function extractVoltageDC(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, VOLTAGE_DC_KEYS)
}

/**
 * Extract AC voltage from metadata
 */
function extractVoltageAC(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, VOLTAGE_AC_KEYS)
}

/**
 * Extract DC current from metadata
 */
function extractCurrentDC(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, CURRENT_DC_KEYS)
}

/**
 * Extract AC current from metadata
 */
function extractCurrentAC(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, CURRENT_AC_KEYS)
}

/**
 * Extract temperature from metadata
 */
function extractTemperature(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, TEMPERATURE_KEYS)
}

/**
 * Extract reactive power from metadata
 */
function extractReactivePower(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, REACTIVE_POWER_KEYS)
}

/**
 * Extract wind speed from metadata
 */
function extractWindSpeed(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, WIND_SPEED_KEYS)
}

/**
 * Extract grid frequency from metadata
 */
function extractFrequency(metadata: Record<string, unknown>): number | null {
  return extractValue(metadata, FREQUENCY_KEYS)
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

    const transformed: TechnicalDataPoint[] = data.map((m) => ({
      time: formatTime(m.timestamp),
      timestamp: m.timestamp,
      voltageDC: extractVoltageDC(m.metadata),
      voltageAC: extractVoltageAC(m.metadata),
      currentDC: extractCurrentDC(m.metadata),
      currentAC: extractCurrentAC(m.metadata),
      temperature: extractTemperature(m.metadata),
      reactivePower: extractReactivePower(m.metadata),
      windSpeed: extractWindSpeed(m.metadata),
      frequency: extractFrequency(m.metadata)
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

  // Check which data types are available
  const hasVoltageDC = chartData.some((d) => d.voltageDC !== null)
  const hasVoltageAC = chartData.some((d) => d.voltageAC !== null)
  const hasCurrentDC = chartData.some((d) => d.currentDC !== null)
  const hasCurrentAC = chartData.some((d) => d.currentAC !== null)
  const hasTempData = chartData.some((d) => d.temperature !== null)
  const hasReactivePower = chartData.some((d) => d.reactivePower !== null)
  const hasWindSpeed = chartData.some((d) => d.windSpeed !== null)
  const hasFrequency = chartData.some((d) => d.frequency !== null)

  // Combined checks for rendering logic
  const hasAnyVoltage = hasVoltageDC || hasVoltageAC
  const hasAnyCurrent = hasCurrentDC || hasCurrentAC
  const hasAnyData = hasAnyVoltage || hasAnyCurrent || hasTempData || hasReactivePower || hasWindSpeed || hasFrequency

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    )
  }

  if (chartData.length === 0 || !hasAnyData) {
    return (
      <div className="h-full flex items-center justify-center bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <p className="text-sm">No technical data available</p>
          <p className="text-xs mt-1">Voltage/current/temperature data not found in metadata</p>
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
            {/* Voltage Y-Axis (left) */}
            {hasAnyVoltage && (
              <YAxis
                yAxisId="voltage"
                stroke="#8B5CF6"
                unit=" V"
                tick={{ fontSize: 10 }}
                width={50}
                domain={['auto', 'auto']}
              />
            )}
            {/* Current Y-Axis (left, hidden if voltage exists) */}
            {hasAnyCurrent && !hasAnyVoltage && (
              <YAxis
                yAxisId="current"
                stroke="#10B981"
                unit=" A"
                tick={{ fontSize: 10 }}
                width={50}
                domain={['auto', 'auto']}
              />
            )}
            {/* Temperature/Other Y-Axis (right) */}
            {(hasTempData || hasWindSpeed || hasReactivePower) && (
              <YAxis
                yAxisId="secondary"
                orientation="right"
                stroke="#EF4444"
                tick={{ fontSize: 10 }}
                width={50}
                domain={['auto', 'auto']}
              />
            )}
            {/* Frequency Y-Axis (right, separate scale for ~49-51 Hz) */}
            {hasFrequency && (
              <YAxis
                yAxisId="frequency"
                orientation="right"
                stroke="#0EA5E9"
                unit=" Hz"
                tick={{ fontSize: 10 }}
                width={55}
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
                switch (name) {
                  case 'voltageDC': return [`${numValue.toFixed(1)} V`, 'DC Voltage']
                  case 'voltageAC': return [`${numValue.toFixed(1)} V`, 'AC Voltage']
                  case 'currentDC': return [`${numValue.toFixed(2)} A`, 'DC Current']
                  case 'currentAC': return [`${numValue.toFixed(2)} A`, 'AC Current']
                  case 'temperature': return [`${numValue.toFixed(1)} °C`, 'Temperature']
                  case 'reactivePower': return [`${numValue.toFixed(0)} VAR`, 'Reactive Power']
                  case 'windSpeed': return [`${numValue.toFixed(1)} m/s`, 'Wind Speed']
                  case 'frequency': return [`${numValue.toFixed(2)} Hz`, 'Grid Frequency']
                  default: return [String(value), name]
                }
              }}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend />

            {/* Voltage Lines */}
            {hasVoltageDC && (
              <Line
                yAxisId="voltage"
                type="monotone"
                dataKey="voltageDC"
                name="voltageDC"
                stroke="#8B5CF6"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            {hasVoltageAC && (
              <Line
                yAxisId="voltage"
                type="monotone"
                dataKey="voltageAC"
                name="voltageAC"
                stroke="#A78BFA"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Current Lines */}
            {hasCurrentDC && (
              <Line
                yAxisId={hasAnyVoltage ? "voltage" : "current"}
                type="monotone"
                dataKey="currentDC"
                name="currentDC"
                stroke="#10B981"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}
            {hasCurrentAC && (
              <Line
                yAxisId={hasAnyVoltage ? "voltage" : "current"}
                type="monotone"
                dataKey="currentAC"
                name="currentAC"
                stroke="#34D399"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Temperature Line */}
            {hasTempData && (
              <Line
                yAxisId="secondary"
                type="monotone"
                dataKey="temperature"
                name="temperature"
                stroke="#EF4444"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Reactive Power Line */}
            {hasReactivePower && (
              <Line
                yAxisId="secondary"
                type="monotone"
                dataKey="reactivePower"
                name="reactivePower"
                stroke="#F59E0B"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Wind Speed Line */}
            {hasWindSpeed && (
              <Line
                yAxisId="secondary"
                type="monotone"
                dataKey="windSpeed"
                name="windSpeed"
                stroke="#06B6D4"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Grid Frequency Line */}
            {hasFrequency && (
              <Line
                yAxisId="frequency"
                type="monotone"
                dataKey="frequency"
                name="frequency"
                stroke="#0EA5E9"
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
