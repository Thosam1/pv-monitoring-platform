import { Zap, Battery, Thermometer, Sun } from 'lucide-react'
import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
 * Extract temperature from metadata - handles both GoodWe and LTI formats
 */
function extractTemperature(metadata: Record<string, unknown>): number | null {
  const tempKeys = ['temperature', 'T_HS', 'internaltemp', 'temp', 'moduleTemp']
  for (const key of tempKeys) {
    const value = metadata[key]
    if (typeof value === 'number' && !isNaN(value)) {
      return value
    }
  }
  return null
}

export function KPIGrid({ data, isLoading }: Readonly<KPIGridProps>) {
  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        peakPower: null,
        totalEnergy: null,
        avgTemperature: null,
        avgIrradiance: null
      }
    }

    // Peak Power: max of activePowerWatts
    const powerValues = data
      .map((d) => d.activePowerWatts)
      .filter((v): v is number => v !== null && !isNaN(v))
    const peakPower = powerValues.length > 0 ? Math.max(...powerValues) : null

    // Total Energy: last value of energyDailyKwh (cumulative)
    const energyValues = data
      .map((d) => d.energyDailyKwh)
      .filter((v): v is number => v !== null && !isNaN(v))
    const totalEnergy = energyValues.length > 0 ? energyValues[energyValues.length - 1] : null

    // Avg Temperature: average of metadata.temperature
    const tempValues = data
      .map((d) => extractTemperature(d.metadata))
      .filter((v): v is number => v !== null)
    const avgTemperature = tempValues.length > 0
      ? tempValues.reduce((a, b) => a + b, 0) / tempValues.length
      : null

    // Avg Irradiance
    const irradianceValues = data
      .map((d) => d.irradiance)
      .filter((v): v is number => v !== null && !isNaN(v))
    const avgIrradiance = irradianceValues.length > 0
      ? irradianceValues.reduce((a, b) => a + b, 0) / irradianceValues.length
      : null

    return { peakPower, totalEnergy, avgTemperature, avgIrradiance }
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
