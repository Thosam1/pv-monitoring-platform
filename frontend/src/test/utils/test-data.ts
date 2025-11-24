import type { MeasurementDataPoint } from '../../components/dashboard'

/**
 * Factory function to create measurement data points for testing
 */
export function createMeasurementDataPoint(
  overrides: Partial<MeasurementDataPoint> = {}
): MeasurementDataPoint {
  return {
    timestamp: new Date('2024-06-15T12:00:00Z'),
    activePowerWatts: 5000,
    energyDailyKwh: 25.5,
    irradiance: 800,
    metadata: {},
    ...overrides
  }
}

/**
 * Create an array of measurement data points with incrementing timestamps
 */
export function createMeasurementSeries(
  count: number,
  baseOverrides: Partial<MeasurementDataPoint> = {}
): MeasurementDataPoint[] {
  const baseTime = new Date('2024-06-15T06:00:00Z')
  return Array.from({ length: count }, (_, i) => {
    const timestamp = new Date(baseTime.getTime() + i * 15 * 60 * 1000) // 15 min intervals
    return createMeasurementDataPoint({
      timestamp,
      activePowerWatts: 1000 + i * 500,
      energyDailyKwh: i * 2.5,
      irradiance: 200 + i * 100,
      ...baseOverrides
    })
  })
}

/**
 * Sample measurement data for testing KPI calculations
 */
export const SAMPLE_MEASUREMENTS: MeasurementDataPoint[] = [
  createMeasurementDataPoint({
    timestamp: new Date('2024-06-15T08:00:00Z'),
    activePowerWatts: 2000,
    energyDailyKwh: 5.0,
    irradiance: 400,
    metadata: { temperature: 25.5 }
  }),
  createMeasurementDataPoint({
    timestamp: new Date('2024-06-15T12:00:00Z'),
    activePowerWatts: 8000,
    energyDailyKwh: 20.0,
    irradiance: 900,
    metadata: { temperature: 35.0 }
  }),
  createMeasurementDataPoint({
    timestamp: new Date('2024-06-15T16:00:00Z'),
    activePowerWatts: 3000,
    energyDailyKwh: 30.0,
    irradiance: 500,
    metadata: { temperature: 30.0 }
  })
]

/**
 * Test data with various temperature metadata formats
 */
export const TEMPERATURE_FORMAT_SAMPLES: MeasurementDataPoint[] = [
  createMeasurementDataPoint({ metadata: { temperature: 25 } }),
  createMeasurementDataPoint({ metadata: { T_HS: 30 } }),
  createMeasurementDataPoint({ metadata: { internaltemp: 28 } }),
  createMeasurementDataPoint({ metadata: { temp: 27 } }),
  createMeasurementDataPoint({ metadata: { moduleTemp: 32 } })
]

/**
 * Test data with null values
 */
export const SPARSE_MEASUREMENTS: MeasurementDataPoint[] = [
  createMeasurementDataPoint({
    activePowerWatts: null,
    energyDailyKwh: 10.0,
    irradiance: null
  }),
  createMeasurementDataPoint({
    activePowerWatts: 5000,
    energyDailyKwh: null,
    irradiance: 600
  }),
  createMeasurementDataPoint({
    activePowerWatts: 3000,
    energyDailyKwh: 25.0,
    irradiance: 700
  })
]
