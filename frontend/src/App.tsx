import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar, SiteHeader } from '@/components/layout'
import { BulkUploader } from './components/BulkUploader'
import {
  DashboardContent,
  type ChartStyle,
  type MeasurementDataPoint,
} from './components/dashboard'
import { AIChatView } from './views/ai-chat-view'
import {
  calculateDateBounds,
  formatDateForInput,
  formatDateLabel,
  type BackendStatus,
  type DataStatus,
} from './lib/date-utils'
import { type LoggerType } from './types/logger'
import { type ViewMode } from './types/view-mode'

// API base URL
const API_BASE = 'http://localhost:3000'

// Type for measurement data from API
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
  // View mode state
  const [currentView, setCurrentView] = useState<ViewMode>('dashboard')

  // Backend and data status
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('loading')
  const [dataStatus, setDataStatus] = useState<DataStatus>('loading')
  const [dataCount, setDataCount] = useState(0)

  // Measurement data (full data points)
  const [measurementData, setMeasurementData] = useState<MeasurementDataPoint[]>([])

  // Logger selection state
  const [availableLoggers, setAvailableLoggers] = useState<LoggerInfo[]>([])
  const [selectedLogger, setSelectedLogger] = useState<string | null>(null)

  // Dashboard controls state
  const [customDate, setCustomDate] = useState<string | null>(null)
  const [chartStyle, setChartStyle] = useState<ChartStyle>('area')
  const [showEnergy, setShowEnergy] = useState(false)
  const [showIrradiance, setShowIrradiance] = useState(false)

  // Track if initial data has been synced
  const [isInitialSync, setIsInitialSync] = useState(true)

  // Available data date range for selected logger
  const [dataDateRange, setDataDateRange] = useState<DataDateRange | null>(null)

  // Computed date label for charts
  const dateLabel =
    measurementData.length > 0 ? formatDateLabel(measurementData[0].timestamp) : null

  // Get the type of the currently selected logger
  const selectedLoggerType =
    availableLoggers.find((l) => l.id === selectedLogger)?.type ?? null

  // Refs for stable callback (prevents BulkUploader re-renders during upload)
  const fetchLoggersRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const fetchMeasurementsRef = useRef<(useSmartSync?: boolean) => Promise<void>>(
    () => Promise.resolve()
  )
  const fetchDateRangeRef = useRef<(loggerId: string) => Promise<void>>(() => Promise.resolve())
  const selectedLoggerRef = useRef<string | null>(null)

  // Fetch available loggers
  const fetchLoggers = useCallback(async () => {
    try {
      const response = await axios.get<{ loggers: Array<{ id: string; type: string }> }>(
        `${API_BASE}/measurements`
      )
      const loggers = response.data.loggers.map((l) => ({
        id: l.id,
        type: l.type as LoggerType,
      }))
      setAvailableLoggers(loggers)
      if (loggers.length > 0 && !selectedLogger) {
        const firstLogger = loggers[0]
        setSelectedLogger(firstLogger.id)
        // Auto-enable irradiance for meteo loggers
        if (firstLogger.type === 'mbmet') {
          setShowIrradiance(true)
        }
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
          latest: new Date(latest),
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
        await axios.get(API_BASE)
        setBackendStatus('connected')

        const loggersResponse = await axios.get<{
          loggers: Array<{ id: string; type: string }>
        }>(`${API_BASE}/measurements`)
        const loggers = loggersResponse.data.loggers.map((l) => ({
          id: l.id,
          type: l.type as LoggerType,
        }))
        setAvailableLoggers(loggers)
        if (loggers.length > 0) {
          const firstLogger = loggers[0]
          setSelectedLogger(firstLogger.id)
          // Auto-enable irradiance for meteo loggers
          if (firstLogger.type === 'mbmet') {
            setShowIrradiance(true)
          }
        }
      } catch {
        setBackendStatus('error')
      }
    }
    void initialize()
  }, [])

  // Fetch measurement data with date filtering
  const fetchMeasurements = useCallback(
    async (useSmartSync = false) => {
      if (!selectedLogger) {
        setDataStatus('empty')
        return
      }

      setDataStatus('loading')
      try {
        // Build URL with optional date params
        let url = `${API_BASE}/measurements/${selectedLogger}`

        // Only pass date params if not doing initial smart sync
        if (!useSmartSync && customDate) {
          const { start, end } = calculateDateBounds('day', customDate)
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
          metadata: m.metadata ?? {},
        }))

        // Sort by timestamp
        transformed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

        // SMART SYNC: On initial load, sync UI to match actual data date
        if (useSmartSync && transformed.length > 0) {
          const firstDataDate = transformed[0].timestamp
          setCustomDate(formatDateForInput(firstDataDate))
          setIsInitialSync(false)
        }

        setMeasurementData(transformed)
        setDataCount(data.length)
        setDataStatus('loaded')
      } catch (error) {
        console.error('Failed to fetch measurements:', error)
        setDataStatus('error')
      }
    },
    [selectedLogger, customDate]
  )

  // Fetch data when backend is connected and logger is selected
  useEffect(() => {
    const loadData = async () => {
      if (backendStatus === 'connected' && selectedLogger) {
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
  }, [customDate]) // eslint-disable-line react-hooks/exhaustive-deps


  // Keep refs updated for stable callback
  useEffect(() => {
    fetchLoggersRef.current = fetchLoggers
    fetchMeasurementsRef.current = fetchMeasurements
    fetchDateRangeRef.current = fetchDateRange
    selectedLoggerRef.current = selectedLogger
  }, [fetchLoggers, fetchMeasurements, fetchDateRange, selectedLogger])

  // Handle upload complete - STABLE callback using refs
  // This prevents BulkUploader from re-rendering during upload
  const handleUploadComplete = useCallback(async () => {
    await fetchLoggersRef.current()
    await fetchMeasurementsRef.current()
    if (selectedLoggerRef.current) {
      await fetchDateRangeRef.current(selectedLoggerRef.current)
    }
  }, []) // Empty deps = stable reference

  // Handle refresh
  const handleRefresh = useCallback(() => {
    void fetchMeasurements(false)
  }, [fetchMeasurements])

  // Handle logger selection with auto-enable irradiance for meteo loggers
  const handleSelectLogger = useCallback(
    (loggerId: string) => {
      setSelectedLogger(loggerId)
      // Navigate to dashboard to show the selected logger's data
      setCurrentView('dashboard')
      // Auto-enable irradiance for meteo loggers (they have no power data)
      const loggerType = availableLoggers.find((l) => l.id === loggerId)?.type
      if (loggerType === 'mbmet') {
        setShowIrradiance(true)
      }
    },
    [availableLoggers]
  )

  // Render main content based on view
  const renderContent = () => {
    switch (currentView) {
      case 'upload':
        return (
          <div className="flex flex-1 flex-col gap-6 p-4">
            <BulkUploader onUploadComplete={handleUploadComplete} />
          </div>
        )

      case 'ai-chat':
        return <AIChatView className="h-full" />

      case 'reports':
        return (
          <div className="flex flex-1 flex-col gap-6 p-4">
            <div className="flex items-center justify-center h-64 bg-card rounded-lg border">
              <p className="text-muted-foreground">Reports view coming soon...</p>
            </div>
          </div>
        )

      case 'dashboard':
      default:
        return (
          <DashboardContent
            measurementData={measurementData}
            isLoading={dataStatus === 'loading'}
            selectedLogger={selectedLogger}
            selectedLoggerType={selectedLoggerType}
            availableLoggers={availableLoggers}
            onSelectLogger={handleSelectLogger}
            dateLabel={dateLabel}
            dataDateRange={dataDateRange}
            dataCount={dataCount}
            customDate={customDate}
            onCustomDateChange={setCustomDate}
            chartStyle={chartStyle}
            onChartStyleChange={setChartStyle}
            showEnergy={showEnergy}
            onShowEnergyChange={setShowEnergy}
            showIrradiance={showIrradiance}
            onShowIrradianceChange={setShowIrradiance}
          />
        )
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar
        loggers={availableLoggers}
        selectedLogger={selectedLogger}
        onSelectLogger={handleSelectLogger}
        backendStatus={backendStatus}
        currentView={currentView}
        onViewChange={setCurrentView}
      />
      <SidebarInset>
        <SiteHeader
          currentView={currentView}
          dateLabel={dateLabel}
          onRefresh={handleRefresh}
          isLoading={dataStatus === 'loading'}
        />
        <main className="flex-1 overflow-auto">{renderContent()}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default App
