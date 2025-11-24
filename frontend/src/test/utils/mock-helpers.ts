import type { AxiosStatic } from 'axios'
import type { Mocked } from 'vitest'

export const API_BASE = 'http://localhost:3000'

export const DEFAULT_LOGGERS = {
  loggers: [
    { id: 'goodwe-001', type: 'goodwe' },
    { id: 'goodwe-002', type: 'goodwe' },
    { id: 'lti-001', type: 'lti' }
  ]
}

export const DEFAULT_MEASUREMENTS = [
  {
    timestamp: '2024-06-15T08:00:00Z',
    activePowerWatts: 2000,
    energyDailyKwh: 5,
    irradiance: 400,
    metadata: { temperature: 25.5 }
  },
  {
    timestamp: '2024-06-15T12:00:00Z',
    activePowerWatts: 8000,
    energyDailyKwh: 20,
    irradiance: 900,
    metadata: { temperature: 35 }
  }
]

export const DEFAULT_DATE_RANGE = {
  earliest: '2024-06-01T00:00:00Z',
  latest: '2024-06-15T23:59:59Z'
}

export interface MockOverrides {
  backendResponse?: string
  loggers?: typeof DEFAULT_LOGGERS
  measurements?: unknown[]
  dateRange?: typeof DEFAULT_DATE_RANGE
}

type MockImplementation = (url: string) => Promise<{ data: unknown }>

/**
 * Creates a mock implementation for axios.get that handles standard API routes
 */
export function createMockImplementation(overrides: MockOverrides = {}): MockImplementation {
  const {
    backendResponse = 'PV Monitoring Backend',
    loggers = DEFAULT_LOGGERS,
    measurements = DEFAULT_MEASUREMENTS,
    dateRange = DEFAULT_DATE_RANGE
  } = overrides

  return (url: string) => {
    if (url === API_BASE) {
      return Promise.resolve({ data: backendResponse })
    }
    if (url === `${API_BASE}/measurements`) {
      return Promise.resolve({ data: loggers })
    }
    if (url.includes('/date-range')) {
      return Promise.resolve({ data: dateRange })
    }
    if (url.includes('/measurements/')) {
      return Promise.resolve({ data: measurements })
    }
    return Promise.reject(new Error('Not found'))
  }
}

/**
 * Sets up standard mocks for axios with optional overrides
 */
export function setupStandardMocks(
  mockedAxios: Mocked<AxiosStatic>,
  overrides?: MockOverrides
): void {
  mockedAxios.get.mockImplementation(createMockImplementation(overrides))
}
