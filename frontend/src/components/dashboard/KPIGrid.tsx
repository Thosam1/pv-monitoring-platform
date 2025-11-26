import { Zap, Battery, Thermometer, Sun, Wind } from 'lucide-react'
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { type LoggerType } from '@/types/logger'

export interface MeasurementDataPoint {
  timestamp: Date
  activePowerWatts: number | null
  energyDailyKwh: number | null
  irradiance: number | null
  metadata: Record<string, unknown>
}

interface KPIGridProps {
  data: MeasurementDataPoint[]
  isLoading?: boolean
  loggerType?: LoggerType | null
}

interface KPICardProps {
  title: string
  value: string
  unit: string
  icon: React.ReactNode
  color: string
}

function KPICard({ title, value, unit, icon, color }: Readonly<KPICardProps>) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
          <div className={`p-2 rounded-full bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${color}`}>{value}</span>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Extract temperature from metadata - handles all logger formats with priority fallback
 * Priority: ambientTemperature -> cellTemperature -> temperatureHeatsink -> temperatureInternal -> legacy keys
 */
function extractTemperature(metadata: Record<string, unknown>): number | null {
  const tempKeys = [
    'ambientTemperature',      // Priority 1: Ambient temperature
    'cellTemperature',         // Priority 2: Cell/Module temperature
    'temperatureHeatsink',     // Priority 3: Heatsink temperature
    'temperatureInternal',     // Priority 4: Internal temperature
    'temperature',             // Legacy fallbacks
    'T_HS',
    'internaltemp',
    'temp',
    'moduleTemp'
  ]
  for (const key of tempKeys) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value
    }
  }
  return null
}

/**
 * Extract cell temperature from metadata - for meteo stations
 * Handles both East and West variants
 */
function extractCellTemperature(metadata: Record<string, unknown>): number | null {
  const tempKeys = [
    'cellTemperature',
    'cellTemperatureWest',
    'cellTemperatureEast',
  ]
  const values: number[] = []
  for (const key of tempKeys) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      values.push(value)
    }
  }
  // Return average if multiple values exist
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/**
 * Extract ambient temperature from metadata - for meteo stations
 * Handles both East and West variants
 */
function extractAmbientTemperature(metadata: Record<string, unknown>): number | null {
  const tempKeys = [
    'ambientTemperature',
    'ambientTemperatureWest',
    'ambientTemperatureEast',
  ]
  const values: number[] = []
  for (const key of tempKeys) {
    const value = metadata[key]
    if (typeof value === 'number' && !Number.isNaN(value)) {
      values.push(value)
    }
  }
  // Return average if multiple values exist
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function KPIGrid({ data, isLoading, loggerType }: Readonly<KPIGridProps>) {
  // Determine if this is a meteo station (irradiance-only device)
  const isMeteoLogger = loggerType === 'mbmet'

  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        peakPower: null,
        totalEnergy: null,
        avgTemperature: null,
        avgIrradiance: null,
        // Meteo-specific stats
        peakIrradiance: null,
        avgCellTemp: null,
        avgAmbientTemp: null,
      }
    }

    // Peak Power: max of activePowerWatts
    const powerValues = data
      .map((d) => d.activePowerWatts)
      .filter((v): v is number => v !== null && !Number.isNaN(v))
    const peakPower = powerValues.length > 0 ? Math.max(...powerValues) : null

    // Total Energy: last value of energyDailyKwh (cumulative)
    const energyValues = data
      .map((d) => d.energyDailyKwh)
      .filter((v): v is number => v !== null && !Number.isNaN(v))
    const totalEnergy = energyValues.length > 0 ? energyValues.at(-1) ?? null : null

    // Avg Temperature: average of metadata.temperature
    const tempValues = data
      .map((d) => extractTemperature(d.metadata))
      .filter((v): v is number => v !== null)
    const avgTemperature = tempValues.length > 0
      ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length
      : null

    // Irradiance stats
    const irradianceValues = data
      .map((d) => d.irradiance)
      .filter((v): v is number => v !== null && !Number.isNaN(v))
    const avgIrradiance = irradianceValues.length > 0
      ? irradianceValues.reduce((a, b) => a + b, 0) / irradianceValues.length
      : null
    const peakIrradiance = irradianceValues.length > 0 ? Math.max(...irradianceValues) : null

    // Meteo-specific: Cell temperature
    const cellTempValues = data
      .map((d) => extractCellTemperature(d.metadata))
      .filter((v): v is number => v !== null)
    const avgCellTemp = cellTempValues.length > 0
      ? cellTempValues.reduce((a, b) => a + b, 0) / cellTempValues.length
      : null

    // Meteo-specific: Ambient temperature
    const ambientTempValues = data
      .map((d) => extractAmbientTemperature(d.metadata))
      .filter((v): v is number => v !== null)
    const avgAmbientTemp = ambientTempValues.length > 0
      ? ambientTempValues.reduce((a, b) => a + b, 0) / ambientTempValues.length
      : null

    return {
      peakPower,
      totalEnergy,
      avgTemperature,
      avgIrradiance,
      peakIrradiance,
      avgCellTemp,
      avgAmbientTemp,
    }
  }, [data])

  const formatValue = (value: number | null, decimals = 1): string => {
    if (value === null) return '--'
    return value.toFixed(decimals)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <div className="h-4 bg-muted rounded w-20 animate-pulse" />
            </CardHeader>
            <CardContent className="pt-0">
              <div className="h-8 bg-muted rounded w-24 animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Render meteo-specific KPIs for weather stations
  if (isMeteoLogger) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard
          title="Peak Irradiance"
          value={formatValue(stats.peakIrradiance, 0)}
          unit="W/m²"
          icon={<Sun className="w-6 h-6 text-yellow-500" />}
          color="text-yellow-500"
        />
        <KPICard
          title="Avg Irradiance"
          value={formatValue(stats.avgIrradiance, 0)}
          unit="W/m²"
          icon={<Sun className="w-6 h-6 text-amber-500" />}
          color="text-amber-500"
        />
        <KPICard
          title="Avg Cell Temp"
          value={formatValue(stats.avgCellTemp, 1)}
          unit="°C"
          icon={<Thermometer className="w-6 h-6 text-red-500" />}
          color="text-red-500"
        />
        <KPICard
          title="Avg Ambient Temp"
          value={formatValue(stats.avgAmbientTemp, 1)}
          unit="°C"
          icon={<Wind className="w-6 h-6 text-blue-500" />}
          color="text-blue-500"
        />
      </div>
    )
  }

  // Render standard inverter KPIs
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <KPICard
        title="Peak Power"
        value={formatValue(stats.peakPower, 0)}
        unit="W"
        icon={<Zap className="w-6 h-6 text-amber-500" />}
        color="text-amber-500"
      />
      <KPICard
        title="Total Energy"
        value={formatValue(stats.totalEnergy, 2)}
        unit="kWh"
        icon={<Battery className="w-6 h-6 text-green-500" />}
        color="text-green-500"
      />
      <KPICard
        title="Avg Temperature"
        value={formatValue(stats.avgTemperature, 1)}
        unit="°C"
        icon={<Thermometer className="w-6 h-6 text-red-500" />}
        color="text-red-500"
      />
      <KPICard
        title="Avg Irradiance"
        value={formatValue(stats.avgIrradiance, 0)}
        unit="W/m²"
        icon={<Sun className="w-6 h-6 text-yellow-500" />}
        color="text-yellow-500"
      />
    </div>
  )
}
