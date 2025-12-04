import { useMemo, useState, useEffect } from 'react'
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

interface GeneratorPowerChartProps {
  data: MeasurementDataPoint[]
  isLoading?: boolean
  loggerId?: string | null
  dateLabel?: string | null
}

interface GeneratorDataPoint {
  time: string
  timestamp: Date
  phaseA: number | null
  phaseB: number | null
  phaseC: number | null
  total: number | null
}

// Generator power metadata keys
const PHASE_A_KEYS = ['generatorPowerPhaseA', 'generator_power_a', 'generatorPowerA']
const PHASE_B_KEYS = ['generatorPowerPhaseB', 'generator_power_b', 'generatorPowerB']
const PHASE_C_KEYS = ['generatorPowerPhaseC', 'generator_power_c', 'generatorPowerC']
const TOTAL_KEYS = ['generatorPowerTotal', 'generator_power_all', 'generatorPowerAll', 'generatorPower']

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
 * Format power value for display
 */
function formatPower(watts: number): string {
  if (Math.abs(watts) >= 1000) {
    return `${(watts / 1000).toFixed(2)} kW`
  }
  return `${watts.toFixed(0)} W`
}

export function GeneratorPowerChart({ data, isLoading, loggerId, dateLabel }: Readonly<GeneratorPowerChartProps>) {
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

    const transformed: GeneratorDataPoint[] = data.map((m) => ({
      time: formatTime(m.timestamp),
      timestamp: m.timestamp,
      phaseA: extractValue(m.metadata, PHASE_A_KEYS),
      phaseB: extractValue(m.metadata, PHASE_B_KEYS),
      phaseC: extractValue(m.metadata, PHASE_C_KEYS),
      total: extractValue(m.metadata, TOTAL_KEYS)
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
  const hasPhaseA = chartData.some((d) => d.phaseA !== null && d.phaseA !== 0)
  const hasPhaseB = chartData.some((d) => d.phaseB !== null && d.phaseB !== 0)
  const hasPhaseC = chartData.some((d) => d.phaseC !== null && d.phaseC !== 0)
  const hasTotal = chartData.some((d) => d.total !== null && d.total !== 0)

  const hasAnyData = hasPhaseA || hasPhaseB || hasPhaseC || hasTotal

  if (isLoading || !isReady) {
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
          <p className="text-sm">No generator power data available</p>
          <p className="text-xs mt-1">Phase breakdown data not found in metadata</p>
        </div>
      </div>
    )
  }

  // Build chart title with context
  const chartTitle = [
    'Generator Power by Phase',
    loggerId && `• ${loggerId}`,
    dateLabel && `• ${dateLabel}`
  ].filter(Boolean).join(' ')

  return (
    <div className="h-full bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 truncate" title={chartTitle}>
        {chartTitle}
      </h3>
      <div className="h-[calc(100%-2rem)]">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="time"
              stroke="#9CA3AF"
              tick={{ fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="#10B981"
              tick={{ fontSize: 10 }}
              width={60}
              domain={['auto', 'auto']}
              tickFormatter={(value) => {
                if (Math.abs(value) >= 1000) {
                  return `${(value / 1000).toFixed(1)}k`
                }
                return value.toString()
              }}
            />
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
                const formatted = formatPower(numValue)
                switch (name) {
                  case 'phaseA': return [formatted, 'Phase A']
                  case 'phaseB': return [formatted, 'Phase B']
                  case 'phaseC': return [formatted, 'Phase C']
                  case 'total': return [formatted, 'Total']
                  default: return [formatted, name]
                }
              }}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend
              formatter={(value) => {
                switch (value) {
                  case 'phaseA': return 'Phase A'
                  case 'phaseB': return 'Phase B'
                  case 'phaseC': return 'Phase C'
                  case 'total': return 'Total'
                  default: return value
                }
              }}
            />

            {/* Phase A Line */}
            {hasPhaseA && (
              <Line
                type="monotone"
                dataKey="phaseA"
                name="phaseA"
                stroke="#EF4444"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Phase B Line */}
            {hasPhaseB && (
              <Line
                type="monotone"
                dataKey="phaseB"
                name="phaseB"
                stroke="#F59E0B"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Phase C Line */}
            {hasPhaseC && (
              <Line
                type="monotone"
                dataKey="phaseC"
                name="phaseC"
                stroke="#3B82F6"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
            )}

            {/* Total Line */}
            {hasTotal && (
              <Line
                type="monotone"
                dataKey="total"
                name="total"
                stroke="#10B981"
                strokeWidth={2}
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
