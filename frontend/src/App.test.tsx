import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import App from './App'

// Mock axios
vi.mock('axios')
const mockedAxios = axios as Mocked<typeof axios>

// Mock framer-motion (used by BulkUploader)
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    )
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>
}))

const API_BASE = 'http://localhost:3000'

// Sample API responses
const mockLoggers = {
  loggers: [
    { id: 'goodwe-001', type: 'goodwe' },
    { id: 'goodwe-002', type: 'goodwe' },
    { id: 'lti-001', type: 'lti' }
  ]
}

const mockMeasurements = [
  {
    timestamp: '2024-06-15T08:00:00Z',
    activePowerWatts: 2000,
    energyDailyKwh: 5.0,
    irradiance: 400,
    metadata: { temperature: 25.5 }
  },
  {
    timestamp: '2024-06-15T12:00:00Z',
    activePowerWatts: 8000,
    energyDailyKwh: 20.0,
    irradiance: 900,
    metadata: { temperature: 35.0 }
  }
]

const mockDateRange = {
  earliest: '2024-06-01T00:00:00Z',
  latest: '2024-06-15T23:59:59Z'
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial rendering', () => {
    it('renders the header with "PV Monitoring Platform"', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'))

      render(<App />)

      expect(screen.getByText('PV Monitoring Platform')).toBeInTheDocument()
      expect(screen.getByText('Advanced Solar Data Visualization Dashboard')).toBeInTheDocument()
    })

    it('renders the status bar section', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'))

      render(<App />)

      expect(screen.getByText('Backend')).toBeInTheDocument()
      expect(screen.getByText('Data Points')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
      expect(screen.getByText('Date Range')).toBeInTheDocument()
    })

    it('renders Quick Info section', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'))

      render(<App />)

      expect(screen.getByText('Quick Info')).toBeInTheDocument()
      expect(screen.getByText('Selected Logger')).toBeInTheDocument()
      expect(screen.getByText('Logger Type')).toBeInTheDocument()
      expect(screen.getByText('Total Records')).toBeInTheDocument()
    })

    it('shows loading state initially', async () => {
      mockedAxios.get.mockImplementation(() => new Promise(() => {})) // Never resolves

      render(<App />)

      expect(screen.getByText('Checking...')).toBeInTheDocument()
    })
  })

  describe('backend connection', () => {
    it('shows "Connected" status when backend responds successfully', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })
    })

    it('shows "Disconnected" status when backend fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'))

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Disconnected')).toBeInTheDocument()
      })
    })

    it('displays backend error message when connection fails', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'))

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Could not connect to backend')).toBeInTheDocument()
      })
    })

    it('displays backend message when connected', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend v1.0' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('PV Monitoring Backend v1.0')).toBeInTheDocument()
      })
    })
  })

  describe('logger selection', () => {
    beforeEach(() => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })
    })

    it('fetches and displays available loggers', async () => {
      render(<App />)

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(`${API_BASE}/measurements`)
      })
    })

    it('selects first logger by default', async () => {
      render(<App />)

      // Wait for backend connection first
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })

      // First logger should be selected - verify by checking the API was called with first logger ID
      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('/measurements/goodwe-001')
        )
      })
    })

    it('displays logger type in Quick Info section', async () => {
      render(<App />)

      await waitFor(() => {
        // Should show GoodWe type for first logger
        expect(screen.getByText('GoodWe')).toBeInTheDocument()
      })
    })
  })

  describe('data fetching', () => {
    beforeEach(() => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })
    })

    it('fetches measurements for selected logger', async () => {
      render(<App />)

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('/measurements/goodwe-001')
        )
      })
    })

    it('shows data point count when data is loaded', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('2')).toBeInTheDocument() // 2 measurements
      })
    })

    it('handles empty data gracefully', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: [] })
        }
        return Promise.reject(new Error('Not found'))
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('No Data')).toBeInTheDocument()
      })
    })

    it('handles fetch errors', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.reject(new Error('Fetch failed'))
        }
        return Promise.reject(new Error('Not found'))
      })

      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument()
      })
    })
  })

  describe('refresh functionality', () => {
    beforeEach(() => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })
    })

    it('renders refresh button', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Refresh Data')).toBeInTheDocument()
      })
    })

    it('refetches data when refresh button is clicked', async () => {
      const user = userEvent.setup()
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })

      const initialCallCount = mockedAxios.get.mock.calls.length

      const refreshButton = screen.getByText('Refresh Data')
      await user.click(refreshButton)

      await waitFor(() => {
        // Should have made additional API call
        expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(initialCallCount)
      })
    })
  })

  describe('Quick Info display', () => {
    beforeEach(() => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })
    })

    it('displays selected logger name', async () => {
      render(<App />)

      await waitFor(() => {
        // Quick Info shows selected logger
        const loggerTexts = screen.getAllByText('goodwe-001')
        expect(loggerTexts.length).toBeGreaterThanOrEqual(1)
      })
    })

    it('displays total records count', async () => {
      render(<App />)

      await waitFor(() => {
        // Quick Info shows total records
        expect(screen.getByText('Total Records')).toBeInTheDocument()
      })
    })

    it('displays chart style setting', async () => {
      render(<App />)

      // Wait for backend connection first
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })

      // Chart Style appears in both DashboardControls and Quick Info
      const chartStyleLabels = screen.getAllByText('Chart Style')
      expect(chartStyleLabels.length).toBeGreaterThanOrEqual(1)
      // Default chart style is 'area' - text content is lowercase even with capitalize class
      expect(screen.getByText('area')).toBeInTheDocument()
    })

    it('displays overlay settings', async () => {
      render(<App />)

      await waitFor(() => {
        expect(screen.getByText('Energy Overlay')).toBeInTheDocument()
        expect(screen.getByText('Irradiance Overlay')).toBeInTheDocument()
      })
    })
  })

  describe('no loggers scenario', () => {
    it('handles case when no loggers are available', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: { loggers: [] } })
        }
        return Promise.reject(new Error('Not found'))
      })

      render(<App />)

      // Wait for backend connection
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument()
      })

      // Wait for Quick Info section to be visible and show "None" for selected logger
      await waitFor(
        () => {
          expect(screen.getByText('Selected Logger')).toBeInTheDocument()
          const noneTexts = screen.getAllByText('None')
          expect(noneTexts.length).toBeGreaterThanOrEqual(1)
        },
        { timeout: 3000 }
      )
    })
  })

  describe('date range display', () => {
    beforeEach(() => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url === API_BASE) {
          return Promise.resolve({ data: 'PV Monitoring Backend' })
        }
        if (url === `${API_BASE}/measurements`) {
          return Promise.resolve({ data: mockLoggers })
        }
        if (url.includes('/date-range')) {
          return Promise.resolve({ data: mockDateRange })
        }
        if (url.includes('/measurements/')) {
          return Promise.resolve({ data: mockMeasurements })
        }
        return Promise.reject(new Error('Not found'))
      })
    })

    it('fetches date range for selected logger', async () => {
      render(<App />)

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('/date-range')
        )
      })
    })

    it('displays date range section', async () => {
      render(<App />)

      await waitFor(() => {
        // The Date Range label should be visible
        expect(screen.getByText('Date Range')).toBeInTheDocument()
      })
    })
  })
})
