/**
 * Calculate start and end dates based on dateRange and customDate
 */
export function calculateDateBounds(
  _dateRange: 'day',
  customDate: string | null
): { start: Date; end: Date } {
  const now = new Date()

  // If custom date is set, use that day
  if (customDate) {
    const date = new Date(customDate)
    const start = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0))
    const end = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999))
    return { start, end }
  }

  // Default to current day
  const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0))
  const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999))
  return { start, end }
}

/**
 * Format a date to YYYY-MM-DD for the date input
 */
export function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Format a date for display in chart titles
 */
export function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// Status type aliases
export type BackendStatus = 'loading' | 'connected' | 'error'
export type DataStatus = 'loading' | 'loaded' | 'empty' | 'error'

/**
 * Status indicator configuration
 */
export interface StatusConfig {
  color: string
  text: string
}

export function getBackendStatusConfig(status: BackendStatus): StatusConfig {
  const configs: Record<BackendStatus, StatusConfig> = {
    connected: { color: 'bg-green-500', text: 'Connected' },
    error: { color: 'bg-red-500', text: 'Disconnected' },
    loading: { color: 'bg-yellow-500', text: 'Checking...' }
  }
  return configs[status]
}

export function getDataStatusConfig(status: DataStatus, dataCount: number): StatusConfig {
  const configs: Record<DataStatus, StatusConfig> = {
    loaded: { color: 'bg-green-500', text: dataCount.toLocaleString() },
    error: { color: 'bg-red-500', text: 'Error' },
    empty: { color: 'bg-yellow-500', text: 'No Data' },
    loading: { color: 'bg-blue-500', text: 'Loading...' }
  }
  return configs[status]
}
