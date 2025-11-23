import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// API base URL
const API_BASE = 'http://localhost:3000'

// Hardcoded logger ID from the ingested data
const LOGGER_ID = '9250KHTU22BP0338'

// Type for measurement data from API
interface MeasurementData {
  timestamp: string
  activePowerWatts: number | null
  energyDailyKwh: number | null
}

// Type for chart data
interface ChartDataPoint {
  time: string
  timestamp: Date
  power: number
  energy: number
}

/**
 * Format timestamp to HH:mm for X-axis
 */
function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

function App() {
  const [backendStatus, setBackendStatus] = useState<'loading' | 'connected' | 'error'>('loading')
  const [backendMessage, setBackendMessage] = useState('')
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [dataStatus, setDataStatus] = useState<'loading' | 'loaded' | 'empty' | 'error'>('loading')
  const [dataCount, setDataCount] = useState(0)
  const [chartDate, setChartDate] = useState<string>('')

  // Check backend connectivity
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await axios.get(API_BASE)
        setBackendMessage(response.data)
        setBackendStatus('connected')
      } catch {
        setBackendStatus('error')
        setBackendMessage('Could not connect to backend')
      }
    }
    checkBackend()
  }, [])

  // Fetch measurement data
  const fetchMeasurements = useCallback(async () => {
    setDataStatus('loading')
    try {
      const response = await axios.get<MeasurementData[]>(
        `${API_BASE}/measurements/${LOGGER_ID}`
      )

      const data = response.data

      if (!data || data.length === 0) {
        setDataStatus('empty')
        setChartData([])
        setDataCount(0)
        setChartDate('')
        return
      }

      // Extract date from first data point for chart title
      const firstTimestamp = new Date(data[0].timestamp)
      const dateString = firstTimestamp.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
      setChartDate(dateString)

      // Transform data for chart
      const transformed: ChartDataPoint[] = data.map((m) => ({
        time: formatTime(m.timestamp),
        timestamp: new Date(m.timestamp),
        power: m.activePowerWatts ?? 0,
        energy: m.energyDailyKwh ?? 0
      }))

      // Sort by timestamp
      transformed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

      // Sample data if too many points (take every Nth point for performance)
      const maxPoints = 200
      const sampledData = transformed.length > maxPoints
        ? transformed.filter((_, i) => i % Math.ceil(transformed.length / maxPoints) === 0)
        : transformed

      setChartData(sampledData)
      setDataCount(data.length)
      setDataStatus('loaded')
    } catch (error) {
      console.error('Failed to fetch measurements:', error)
      setDataStatus('error')
    }
  }, [])

  // Fetch data when backend is connected
  useEffect(() => {
    if (backendStatus === 'connected') {
      fetchMeasurements()
    }
  }, [backendStatus, fetchMeasurements])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            PV Monitoring Platform
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            High-Throughput Solar Data Ingestion Platform - MVP
          </p>
        </header>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Backend Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Backend Status</h3>
            <div className="mt-2 flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                backendStatus === 'connected' ? 'bg-green-500' :
                backendStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'
              }`}></span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {backendStatus === 'connected' ? 'Connected' :
                 backendStatus === 'error' ? 'Disconnected' : 'Checking...'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{backendMessage}</p>
          </div>

          {/* Data Status */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Data Points</h3>
            <div className="mt-2 flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                dataStatus === 'loaded' ? 'bg-green-500' :
                dataStatus === 'error' ? 'bg-red-500' :
                dataStatus === 'empty' ? 'bg-yellow-500' : 'bg-blue-500'
              }`}></span>
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                {dataStatus === 'loading' ? 'Loading...' :
                 dataStatus === 'loaded' ? dataCount.toLocaleString() :
                 dataStatus === 'empty' ? 'No Data' : 'Error'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Logger: {LOGGER_ID}</p>
          </div>

          {/* Current Power */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Latest Power</h3>
            <div className="mt-2">
              <span className="text-2xl font-bold text-amber-500">
                {chartData.length > 0 ? `${chartData[chartData.length - 1].power.toFixed(0)} W` : '-- W'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {chartData.length > 0 ? chartData[chartData.length - 1].time : '--:--'}
            </p>
          </div>

          {/* Daily Energy */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Daily Energy</h3>
            <div className="mt-2">
              <span className="text-2xl font-bold text-green-500">
                {chartData.length > 0 ? `${chartData[chartData.length - 1].energy.toFixed(2)} kWh` : '-- kWh'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Cumulative today</p>
          </div>
        </div>

        {/* Power Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Active Power Output
              </h2>
              {chartDate && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {chartDate}
                </p>
              )}
            </div>
            <button
              onClick={fetchMeasurements}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            >
              Refresh
            </button>
          </div>

          {dataStatus === 'loading' && (
            <div className="h-64 flex items-center justify-center">
              <div className="text-gray-500">Loading chart data...</div>
            </div>
          )}

          {dataStatus === 'empty' && (
            <div className="h-64 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p className="mb-2">No measurement data available</p>
                <p className="text-sm">Upload a CSV file via POST /ingest/goodwe</p>
              </div>
            </div>
          )}

          {dataStatus === 'error' && (
            <div className="h-64 flex items-center justify-center">
              <div className="text-red-500">Failed to load data. Check backend connection.</div>
            </div>
          )}

          {dataStatus === 'loaded' && chartData.length > 0 && (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="time"
                    stroke="#9CA3AF"
                    tick={{ fontSize: 12 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="#9CA3AF"
                    unit=" W"
                    tick={{ fontSize: 12 }}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1F2937',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#F9FAFB'
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)} W`, 'Power']}
                    labelFormatter={(label) => `Time: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="power"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={false}
                    name="Active Power"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Quick Start Instructions */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Quick Start
          </h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-xs mr-3 flex-shrink-0">1</span>
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">docker-compose up -d</code>
              <span className="ml-2">- Start PostgreSQL</span>
            </div>
            <div className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-xs mr-3 flex-shrink-0">2</span>
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">cd backend && npm run start:dev</code>
              <span className="ml-2">- Start API</span>
            </div>
            <div className="flex items-start">
              <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-500 text-white rounded-full text-xs mr-3 flex-shrink-0">3</span>
              <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">curl -X POST http://localhost:3000/ingest/goodwe -F "file=@data.csv"</code>
              <span className="ml-2">- Upload Data</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
