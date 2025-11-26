import {
  DashboardControls,
  KPIGrid,
  PerformanceChart,
  TechnicalChart,
  GeneratorPowerChart,
  type ChartStyle,
  type MeasurementDataPoint,
} from '@/components/dashboard'
import { LoggerContextBar } from './logger-context-bar'
import { Badge } from '@/components/ui/badge'
import { type LoggerType } from '@/types/logger'
import { Calendar, Activity, BarChart3, Sun, Zap } from 'lucide-react'

interface LoggerInfo {
  id: string
  type: LoggerType
}

interface DataDateRange {
  earliest: Date
  latest: Date
}

interface DashboardContentProps {
  measurementData: MeasurementDataPoint[]
  isLoading: boolean
  selectedLogger: string | null
  selectedLoggerType: LoggerType | null
  availableLoggers: LoggerInfo[]
  onSelectLogger: (loggerId: string) => void
  dateLabel: string | null
  dataDateRange: DataDateRange | null
  dataCount: number
  // Controls
  customDate: string | null
  onCustomDateChange: (date: string | null) => void
  chartStyle: ChartStyle
  onChartStyleChange: (style: ChartStyle) => void
  showEnergy: boolean
  onShowEnergyChange: (show: boolean) => void
  showIrradiance: boolean
  onShowIrradianceChange: (show: boolean) => void
}

function formatDateRange(range: DataDateRange | null): string {
  if (!range) return 'No data'
  const format = (d: Date) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  return `${format(range.earliest)} → ${format(range.latest)}`
}

export function DashboardContent({
  measurementData,
  isLoading,
  selectedLogger,
  selectedLoggerType,
  availableLoggers,
  onSelectLogger,
  dateLabel,
  dataDateRange,
  dataCount,
  customDate,
  onCustomDateChange,
  chartStyle,
  onChartStyleChange,
  showEnergy,
  onShowEnergyChange,
  showIrradiance,
  onShowIrradianceChange,
}: Readonly<DashboardContentProps>) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      {/* Logger Context Bar */}
      <LoggerContextBar
        loggers={availableLoggers}
        selectedLogger={selectedLogger}
        onSelectLogger={onSelectLogger}
        dataCount={dataCount}
      />

      {/* KPI Grid */}
      <KPIGrid data={measurementData} isLoading={isLoading} loggerType={selectedLoggerType} />

      {/* Dashboard Controls */}
      <DashboardControls
        customDate={customDate}
        onCustomDateChange={onCustomDateChange}
        chartStyle={chartStyle}
        onChartStyleChange={onChartStyleChange}
        showEnergy={showEnergy}
        onShowEnergyChange={onShowEnergyChange}
        showIrradiance={showIrradiance}
        onShowIrradianceChange={onShowIrradianceChange}
      />

      {/* Performance Chart */}
      <div className="h-96">
        <PerformanceChart
          data={measurementData}
          chartStyle={chartStyle}
          showEnergy={showEnergy}
          showIrradiance={showIrradiance}
          isLoading={isLoading}
          loggerId={selectedLogger}
          dateLabel={dateLabel}
          dataDateRange={dataDateRange}
          onDateSelect={onCustomDateChange}
        />
      </div>

      {/* Secondary Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Technical Chart */}
        <div className="h-64">
          <TechnicalChart
            data={measurementData}
            isLoading={isLoading}
            loggerId={selectedLogger}
            dateLabel={dateLabel}
          />
        </div>

        {/* Generator Power Chart */}
        <div className="h-64">
          <GeneratorPowerChart
            data={measurementData}
            isLoading={isLoading}
            loggerId={selectedLogger}
            dateLabel={dateLabel}
          />
        </div>
      </div>

      {/* Logger Summary Card */}
      <div className="h-auto">
        <div className="h-full bg-card rounded-lg border shadow-sm p-4">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity className="size-4" />
            Logger Summary
          </h3>

          <div className="flex flex-wrap gap-8">
            {/* Data Range */}
            <div className="flex items-start gap-3">
              <Calendar className="size-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground">Data Range</p>
                <p className="text-sm font-medium">
                  {formatDateRange(dataDateRange)}
                </p>
              </div>
            </div>

            {/* Currently Viewing */}
            {dateLabel && (
              <div className="flex items-start gap-3">
                <Calendar className="size-4 text-blue-500 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">
                    Currently Viewing
                  </p>
                  <p className="text-sm font-medium">{dateLabel}</p>
                </div>
              </div>
            )}

            {/* Active Settings */}
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Active Settings
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="secondary"
                  className="gap-1.5 text-xs capitalize"
                >
                  <BarChart3 className="size-3" />
                  {chartStyle}
                </Badge>
                {showEnergy && (
                  <Badge
                    variant="secondary"
                    className="gap-1.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  >
                    <Zap className="size-3" />
                    Energy
                  </Badge>
                )}
                {showIrradiance && (
                  <Badge
                    variant="secondary"
                    className="gap-1.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                  >
                    <Sun className="size-3" />
                    Irradiance
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
