import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { BulkUploader } from './components/BulkUploader'
import {
  DashboardControls,
  KPIGrid,
  PerformanceChart,
  TechnicalChart,
  type DateRange,
  type ChartStyle,
  type MeasurementDataPoint
} from './components/dashboard'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  calculateDateBounds,
  formatDateForInput,
  formatDateLabel,
  getBackendStatusConfig,
  getDataStatusConfig,
  type BackendStatus,
  type DataStatus
} from './lib/date-utils'
import { type LoggerType, LOGGER_CONFIG, LOGGER_GROUPS } from './types/logger'

// API base URL
const API_BASE = 'http://localhost:3000'

// Type for measurement data from API (extended with new fields)
interface MeasurementData {
  timestamp: string
  activePowerWatts: number | null
  energyDailyKwh: number | null
  irradiance: number | null
  metadata: Record<string, unknown>
}

// Type for date range response from API
interface DateRangeResponse {
  earliest: string | null
  latest: string | null
}

// Type for parsed date range
interface DataDateRange {
  earliest: Date
  latest: Date
}

// Type for logger with type information
interface LoggerInfo {
  id: string
  type: LoggerType
}

function App() {
  // Backend and data status
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('loading')
  const [backendMessage, setBackendMessage] = useState('')
  const [dataStatus, setDataStatus] = useState<DataStatus>('loading')
  const [dataCount, setDataCount] = useState(0)

  // Measurement data (full data points)
  const [measurementData, setMeasurementData] = useState<MeasurementDataPoint[]>([])

  // Logger selection state
  const [availableLoggers, setAvailableLoggers] = useState<LoggerInfo[]>([])
  const [selectedLogger, setSelectedLogger] = useState<string | null>(null)

  // Dashboard controls state
  const [dateRange, setDateRange] = useState<DateRange>('day')
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [chartStyle, setChartStyle] = useState<ChartStyle>('area')
  const [showEnergy, setShowEnergy] = useState(false)
  const [showIrradiance, setShowIrradiance] = useState(false)

  // Track if initial data has been synced
  const [isInitialSync, setIsInitialSync] = useState(true)

  // Available data date range for selected logger
  const [dataDateRange, setDataDateRange] = useState<DataDateRange | null>(null)

  // Computed date label for charts
  const dateLabel = measurementData.length > 0
    ? formatDateLabel(measurementData[0].timestamp)
    : null

  // Fetch available loggers
  const fetchLoggers = useCallback(async () => {
    try {
      const response = await axios.get<{ loggers: Array<{ id: string; type: string }> }>(`${API_BASE}/measurements`)
      const loggers = response.data.loggers.map(l => ({ id: l.id, type: l.type as LoggerType }))
      setAvailableLoggers(loggers)
      if (loggers.length > 0 && !selectedLogger) {
        setSelectedLogger(loggers[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch loggers:', error)
    }
  }, [selectedLogger])

  // Fetch date range for selected logger
  const fetchDateRange = useCallback(async (loggerId: string) => {
    try {
      const response = await axios.get<DateRangeResponse>(
        `${API_BASE}/measurements/${loggerId}/date-range`
      )
      const { earliest, latest } = response.data
      if (earliest && latest) {
        setDataDateRange({
          earliest: new Date(earliest),
          latest: new Date(latest)
        })
      } else {
        setDataDateRange(null)
      }
    } catch (error) {
      console.error('Failed to fetch date range:', error)
      setDataDateRange(null)
    }
  }, [])

  // Check backend connectivity and fetch loggers on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        const response = await axios.get(API_BASE)
        setBackendMessage(response.data)
        setBackendStatus('connected')

        const loggersResponse = await axios.get<{ loggers: Array<{ id: string; type: string }> }>(`${API_BASE}/measurements`)
        const loggers = loggersResponse.data.loggers.map(l => ({ id: l.id, type: l.type as LoggerType }))
        setAvailableLoggers(loggers)
        if (loggers.length > 0) {
          setSelectedLogger(loggers[0].id)
        }
      } catch {
        setBackendStatus('error')
        setBackendMessage('Could not connect to backend')
      }
    }
    void initialize()
  }, [])

  // Fetch measurement data with date filtering
  const fetchMeasurements = useCallback(async (useSmartSync = false) => {
    if (!selectedLogger) {
      setDataStatus('empty')
      return
    }

    setDataStatus('loading')
    try {
      // Build URL with optional date params
      let url = `${API_BASE}/measurements/${selectedLogger}`

      // Only pass date params if not doing initial smart sync
      if (!useSmartSync && (customDate || dateRange !== 'day')) {
        const { start, end } = calculateDateBounds(dateRange, customDate)
        const params = new URLSearchParams()
        params.append('start', start.toISOString())
        params.append('end', end.toISOString())
        url += `?${params.toString()}`
      }

      const response = await axios.get<MeasurementData[]>(url)
      const data = response.data

      if (!data || data.length === 0) {
        setDataStatus('empty')
        setMeasurementData([])
        setDataCount(0)
        return
      }

      // Transform to MeasurementDataPoint format
      const transformed: MeasurementDataPoint[] = data.map((m) => ({
        timestamp: new Date(m.timestamp),
        activePowerWatts: m.activePowerWatts,
        energyDailyKwh: m.energyDailyKwh,
        irradiance: m.irradiance,
        metadata: m.metadata ?? {}
      }))

      // Sort by timestamp
      transformed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      // SMART SYNC: On initial load, sync UI to match actual data date
      if (useSmartSync && transformed.length > 0) {
        const firstDataDate = transformed[0].timestamp
        setCustomDate(formatDateForInput(firstDataDate))
        setDateRange('day')
        setIsInitialSync(false)
      }

      setMeasurementData(transformed)
      setDataCount(data.length)
      setDataStatus('loaded')
    } catch (error) {
      console.error('Failed to fetch measurements:', error)
      setDataStatus('error')
    }
  }, [selectedLogger, dateRange, customDate])

  // Fetch data when backend is connected and logger is selected
  useEffect(() => {
    const loadData = async () => {
      if (backendStatus === 'connected' && selectedLogger) {
        // Use smart sync on initial load to match UI to actual data date
        await fetchMeasurements(isInitialSync)
      }
    }
    void loadData()
  }, [backendStatus, selectedLogger, fetchMeasurements, isInitialSync])

  // Fetch date range when logger changes
  useEffect(() => {
    const loadDateRange = async () => {
      if (backendStatus === 'connected' && selectedLogger) {
        await fetchDateRange(selectedLogger)
      }
    }
    void loadDateRange()
  }, [backendStatus, selectedLogger, fetchDateRange])

  // Re-fetch when date controls change (but not during initial sync)
  useEffect(() => {
    const loadData = async () => {
      if (!isInitialSync && backendStatus === 'connected' && selectedLogger) {
        await fetchMeasurements(false)
      }
    }
    void loadData()
  }, [dateRange, customDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle upload complete
  const handleUploadComplete = useCallback(async () => {
    await fetchLoggers()
    await fetchMeasurements()
    // Refresh date range after upload
    if (selectedLogger) {
      await fetchDateRange(selectedLogger)
    }
  }, [fetchLoggers, fetchMeasurements, fetchDateRange, selectedLogger])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            PV Monitoring Platform
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Advanced Solar Data Visualization Dashboard
          </p>
        </header>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Bulk Uploader - Full Width */}
          <div className="lg:col-span-4">
            <BulkUploader onUploadComplete={handleUploadComplete} />
          </div>

          {/* Status Bar - Full Width */}
          <div className="lg:col-span-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Backend Status */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Backend</h3>
                <div className="mt-2 flex items-center">
                  <span className={`inline-block w-3 h-3 rounded-full mr-2 ${getBackendStatusConfig(backendStatus).color}`}></span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {getBackendStatusConfig(backendStatus).text}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 truncate">{backendMessage}</p>
              </div>

              {/* Data Points with Logger Selector */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Data Points</h3>
                <div className="mt-2 flex items-center">
                  <span className={`inline-block w-3 h-3 rounded-full mr-2 ${getDataStatusConfig(dataStatus, dataCount).color}`}></span>
                  <span className="text-lg font-semibold text-gray-900 dark:text-white">
                    {getDataStatusConfig(dataStatus, dataCount).text}
                  </span>
                </div>
                {/* Logger Selector */}
                <div className="mt-2">
                  <Select
                    value={selectedLogger ?? ""}
                    onValueChange={(value) => setSelectedLogger(value || null)}
                  >
                    <SelectTrigger className="h-7 text-xs w-full">
                      <SelectValue placeholder="Select Logger" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLoggers.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          No loggers found
                        </div>
                      ) : (
                        <>
                          {LOGGER_GROUPS.map(group => {
                            const groupLoggers = availableLoggers.filter(l =>
                              group.options.some(opt => opt.value === l.type)
                            )
                            if (groupLoggers.length === 0) return null
                            return (
                              <SelectGroup key={group.label}>
                                <SelectLabel>{group.label}</SelectLabel>
                                {groupLoggers
                                  .sort((a, b) => a.id.localeCompare(b.id))
                                  .map((logger) => (
                                    <SelectItem key={logger.id} value={logger.id}>
                                      <span className="flex items-center gap-2">
                                        <span className={`inline-block w-2 h-2 rounded-full ${LOGGER_CONFIG[logger.type].color}`} />
                                        {logger.id}
                                      </span>
                                    </SelectItem>
                                  ))}
                              </SelectGroup>
                            )
                          })}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Refresh Button */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex flex-col justify-between">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Actions</h3>
                <button
                  onClick={() => fetchMeasurements(false)}
                  className="mt-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition cursor-pointer"
                >
                  Refresh Data
                </button>
              </div>

              {/* Date Display */}
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Date Range</h3>
                <div className="mt-2">
                  <span className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                    {customDate ? new Date(customDate).toLocaleDateString() : dateRange}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {measurementData.length > 0
                    ? measurementData[0].timestamp.toLocaleDateString()
                    : 'No data'}
                </p>
              </div>
            </div>
          </div>

          {/* KPI Grid - Full Width */}
          <div className="lg:col-span-4">
            <KPIGrid data={measurementData} isLoading={dataStatus === 'loading'} />
          </div>

          {/* Dashboard Controls - Full Width */}
          <div className="lg:col-span-4">
            <DashboardControls
              customDate={customDate}
              onCustomDateChange={setCustomDate}
              chartStyle={chartStyle}
              onChartStyleChange={setChartStyle}
              showEnergy={showEnergy}
              onShowEnergyChange={setShowEnergy}
              showIrradiance={showIrradiance}
              onShowIrradianceChange={setShowIrradiance}
            />
          </div>

          {/* Performance Chart - Full Width */}
          <div className="lg:col-span-4 h-96">
            <PerformanceChart
              data={measurementData}
              chartStyle={chartStyle}
              showEnergy={showEnergy}
              showIrradiance={showIrradiance}
              isLoading={dataStatus === 'loading'}
              loggerId={selectedLogger}
              dateLabel={dateLabel}
              dataDateRange={dataDateRange}
            />
          </div>

          {/* Technical Chart - Half Width */}
          <div className="lg:col-span-2 h-64">
            <TechnicalChart
              data={measurementData}
              isLoading={dataStatus === 'loading'}
              loggerId={selectedLogger}
              dateLabel={dateLabel}
            />
          </div>

          {/* Energy Summary Card - Half Width */}
          <div className="lg:col-span-2 h-64">
            <div className="h-full bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                Quick Info
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Selected Logger</span>
                  <span className="text-gray-900 dark:text-white font-medium truncate max-w-[150px]">
                    {selectedLogger ?? 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Logger Type</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    {selectedLogger && (() => {
                      const loggerInfo = availableLoggers.find(l => l.id === selectedLogger)
                      if (!loggerInfo) return 'Unknown'
                      const config = LOGGER_CONFIG[loggerInfo.type]
                      return (
                        <span className="inline-flex items-center">
                          <span className={`inline-block w-2 h-2 rounded-full ${config.color} mr-1.5`}></span>
                          <span>{config.label}</span>
                        </span>
                      )
                    })()}
                    {!selectedLogger && 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Total Records</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    {dataCount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Chart Style</span>
                  <span className="text-gray-900 dark:text-white font-medium capitalize">
                    {chartStyle}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Energy Overlay</span>
                  <span className={`font-medium ${showEnergy ? 'text-green-500' : 'text-gray-400'}`}>
                    {showEnergy ? 'On' : 'Off'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Irradiance Overlay</span>
                  <span className={`font-medium ${showIrradiance ? 'text-yellow-500' : 'text-gray-400'}`}>
                    {showIrradiance ? 'On' : 'Off'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
