import {
  DashboardControls,
  KPIGrid,
  PerformanceChart,
  TechnicalChart,
  type ChartStyle,
  type MeasurementDataPoint,
} from '@/components/dashboard'
import { type LoggerType, LOGGER_CONFIG } from '@/types/logger'

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
  availableLoggers: LoggerInfo[]
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

export function DashboardContent({
  measurementData,
  isLoading,
  selectedLogger,
  availableLoggers,
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
  const selectedLoggerInfo = availableLoggers.find((l) => l.id === selectedLogger)
  const loggerConfig = selectedLoggerInfo ? LOGGER_CONFIG[selectedLoggerInfo.type] : null

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 pt-0">
      {/* KPI Grid */}
      <KPIGrid data={measurementData} isLoading={isLoading} />

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
        />
      </div>

      {/* Bottom Grid: Technical Chart + Quick Info */}
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

        {/* Quick Info Card */}
        <div className="h-64">
          <div className="h-full bg-card rounded-lg border shadow-sm p-4">
            <h3 className="text-sm font-semibold mb-4">Quick Info</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selected Logger</span>
                <span className="font-medium truncate max-w-[150px]">
                  {selectedLogger ?? 'None'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Logger Type</span>
                <span className="font-medium">
                  {loggerConfig ? (
                    <span className="inline-flex items-center">
                      <span
                        className={`inline-block w-2 h-2 rounded-full ${loggerConfig.color} mr-1.5`}
                      />
                      <span>{loggerConfig.label}</span>
                    </span>
                  ) : (
                    'None'
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Records</span>
                <span className="font-medium">{dataCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chart Style</span>
                <span className="font-medium capitalize">{chartStyle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Energy Overlay</span>
                <span
                  className={`font-medium ${showEnergy ? 'text-green-500' : 'text-muted-foreground'}`}
                >
                  {showEnergy ? 'On' : 'Off'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Irradiance Overlay</span>
                <span
                  className={`font-medium ${showIrradiance ? 'text-yellow-500' : 'text-muted-foreground'}`}
                >
                  {showIrradiance ? 'On' : 'Off'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
