import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  calculateDateBounds,
  formatDateForInput,
  formatDateLabel,
  getBackendStatusConfig,
  getDataStatusConfig
} from './date-utils'

describe('calculateDateBounds', () => {
  beforeEach(() => {
    // Mock current date to 2024-06-15 14:30:00 UTC
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-15T14:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns current day bounds when no custom date is set', () => {
    const { start, end } = calculateDateBounds('day', null)

    expect(start.toISOString()).toBe('2024-06-15T00:00:00.000Z')
    expect(end.toISOString()).toBe('2024-06-15T23:59:59.999Z')
  })

  it('returns custom date bounds when custom date is provided', () => {
    const { start, end } = calculateDateBounds('day', '2024-03-20')

    expect(start.toISOString()).toBe('2024-03-20T00:00:00.000Z')
    expect(end.toISOString()).toBe('2024-03-20T23:59:59.999Z')
  })

  it('handles year boundary correctly', () => {
    const { start, end } = calculateDateBounds('day', '2023-12-31')

    expect(start.toISOString()).toBe('2023-12-31T00:00:00.000Z')
    expect(end.toISOString()).toBe('2023-12-31T23:59:59.999Z')
  })

  it('handles leap year date', () => {
    const { start, end } = calculateDateBounds('day', '2024-02-29')

    expect(start.toISOString()).toBe('2024-02-29T00:00:00.000Z')
    expect(end.toISOString()).toBe('2024-02-29T23:59:59.999Z')
  })
})

describe('formatDateForInput', () => {
  it('formats date to YYYY-MM-DD', () => {
    const date = new Date('2024-06-15T14:30:00Z')
    expect(formatDateForInput(date)).toBe('2024-06-15')
  })

  it('pads single digit month and day', () => {
    const date = new Date('2024-01-05T10:00:00Z')
    expect(formatDateForInput(date)).toBe('2024-01-05')
  })

  it('handles end of year', () => {
    const date = new Date('2024-12-31T23:59:59Z')
    expect(formatDateForInput(date)).toBe('2024-12-31')
  })
})

describe('formatDateLabel', () => {
  it('formats date with weekday, month, day, and year', () => {
    const date = new Date('2024-06-15T12:00:00Z')
    const label = formatDateLabel(date)

    // Should contain all parts (exact format depends on locale)
    expect(label).toMatch(/Sat/)
    expect(label).toMatch(/Jun/)
    expect(label).toMatch(/15/)
    expect(label).toMatch(/2024/)
  })

  it('handles different dates correctly', () => {
    const date = new Date('2024-01-01T12:00:00Z')
    const label = formatDateLabel(date)

    expect(label).toMatch(/Mon/)
    expect(label).toMatch(/Jan/)
    expect(label).toMatch(/1/)
    expect(label).toMatch(/2024/)
  })
})

describe('getBackendStatusConfig', () => {
  it('returns connected config', () => {
    const config = getBackendStatusConfig('connected')
    expect(config).toEqual({
      color: 'bg-green-500',
      text: 'Connected'
    })
  })

  it('returns error config', () => {
    const config = getBackendStatusConfig('error')
    expect(config).toEqual({
      color: 'bg-red-500',
      text: 'Disconnected'
    })
  })

  it('returns loading config', () => {
    const config = getBackendStatusConfig('loading')
    expect(config).toEqual({
      color: 'bg-yellow-500',
      text: 'Checking...'
    })
  })
})

describe('getDataStatusConfig', () => {
  it('returns loaded config with formatted count', () => {
    const config = getDataStatusConfig('loaded', 1234)
    expect(config).toEqual({
      color: 'bg-green-500',
      text: '1,234'
    })
  })

  it('returns error config', () => {
    const config = getDataStatusConfig('error', 0)
    expect(config).toEqual({
      color: 'bg-red-500',
      text: 'Error'
    })
  })

  it('returns empty config', () => {
    const config = getDataStatusConfig('empty', 0)
    expect(config).toEqual({
      color: 'bg-yellow-500',
      text: 'No Data'
    })
  })

  it('returns loading config', () => {
    const config = getDataStatusConfig('loading', 0)
    expect(config).toEqual({
      color: 'bg-blue-500',
      text: 'Loading...'
    })
  })

  it('formats large numbers with commas', () => {
    const config = getDataStatusConfig('loaded', 1000000)
    expect(config.text).toBe('1,000,000')
  })
})
