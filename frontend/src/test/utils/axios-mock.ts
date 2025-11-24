import { vi, type Mocked } from 'vitest'
import axios from 'axios'

// Mock axios module
vi.mock('axios')

const mockedAxios = axios as Mocked<typeof axios>

/**
 * Setup axios mock with default successful responses
 */
export function setupAxiosMock() {
  mockedAxios.get.mockReset()
  mockedAxios.post.mockReset()
  return mockedAxios
}

/**
 * Mock successful backend connection
 */
export function mockBackendConnection(mock: Mocked<typeof axios>) {
  mock.get.mockImplementation((url: string) => {
    if (url === 'http://localhost:3000') {
      return Promise.resolve({ data: 'PV Monitoring Backend' })
    }
    if (url === 'http://localhost:3000/measurements') {
      return Promise.resolve({ data: { loggerIds: ['logger-1', 'logger-2'] } })
    }
    return Promise.reject(new Error('Not found'))
  })
}

/**
 * Mock measurement data response
 */
export function mockMeasurementsResponse(
  mock: Mocked<typeof axios>,
  data: unknown[]
) {
  mock.get.mockImplementation((url: string) => {
    if (url.includes('/measurements/')) {
      return Promise.resolve({ data })
    }
    return Promise.reject(new Error('Not found'))
  })
}

/**
 * Mock failed backend connection
 */
export function mockBackendError(mock: Mocked<typeof axios>) {
  mock.get.mockRejectedValue(new Error('Network Error'))
}

export { mockedAxios }
