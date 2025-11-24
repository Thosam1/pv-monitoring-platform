import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KPIGrid } from './KPIGrid'
import {
  SAMPLE_MEASUREMENTS,
  TEMPERATURE_FORMAT_SAMPLES,
  SPARSE_MEASUREMENTS,
  createMeasurementDataPoint
} from '../../test/utils/test-data'

describe('KPIGrid', () => {
  describe('rendering', () => {
    it('renders all four KPI cards', () => {
      render(<KPIGrid data={SAMPLE_MEASUREMENTS} />)

      expect(screen.getByText('Peak Power')).toBeInTheDocument()
      expect(screen.getByText('Total Energy')).toBeInTheDocument()
      expect(screen.getByText('Avg Temperature')).toBeInTheDocument()
      expect(screen.getByText('Avg Irradiance')).toBeInTheDocument()
    })

    it('renders loading skeleton when isLoading is true', () => {
      const { container } = render(<KPIGrid data={[]} isLoading={true} />)

      const skeletons = container.querySelectorAll('.animate-pulse')
      expect(skeletons.length).toBe(4)
    })

    it('displays units for each KPI', () => {
      render(<KPIGrid data={SAMPLE_MEASUREMENTS} />)

      expect(screen.getByText('W')).toBeInTheDocument()
      expect(screen.getByText('kWh')).toBeInTheDocument()
      expect(screen.getByText('°C')).toBeInTheDocument()
      expect(screen.getByText('W/m²')).toBeInTheDocument()
    })
  })

  describe('data aggregation', () => {
    it('calculates peak power as maximum of activePowerWatts', () => {
      render(<KPIGrid data={SAMPLE_MEASUREMENTS} />)

      // SAMPLE_MEASUREMENTS has powers: 2000, 8000, 3000 -> max is 8000
      expect(screen.getByText('8000')).toBeInTheDocument()
    })

    it('calculates total energy as last energyDailyKwh value', () => {
      render(<KPIGrid data={SAMPLE_MEASUREMENTS} />)

      // SAMPLE_MEASUREMENTS has energies: 5.0, 20.0, 30.0 -> last is 30.0
      expect(screen.getByText('30.00')).toBeInTheDocument()
    })

    it('calculates average temperature from metadata', () => {
      render(<KPIGrid data={SAMPLE_MEASUREMENTS} />)

      // SAMPLE_MEASUREMENTS has temps: 25.5, 35.0, 30.0 -> avg is 30.17
      expect(screen.getByText('30.2')).toBeInTheDocument()
    })

    it('calculates average irradiance', () => {
      render(<KPIGrid data={SAMPLE_MEASUREMENTS} />)

      // SAMPLE_MEASUREMENTS has irradiances: 400, 900, 500 -> avg is 600
      expect(screen.getByText('600')).toBeInTheDocument()
    })
  })

  describe('empty/null handling', () => {
    it('displays dashes when data is empty', () => {
      render(<KPIGrid data={[]} />)

      const dashes = screen.getAllByText('--')
      expect(dashes.length).toBe(4)
    })

    it('handles sparse data with null values', () => {
      render(<KPIGrid data={SPARSE_MEASUREMENTS} />)

      // Should still calculate values from non-null entries
      // Power: null, 5000, 3000 -> max is 5000
      expect(screen.getByText('5000')).toBeInTheDocument()

      // Energy: 10.0, null, 25.0 -> last non-null in original order is 25.0
      expect(screen.getByText('25.00')).toBeInTheDocument()

      // Irradiance: null, 600, 700 -> avg is 650
      expect(screen.getByText('650')).toBeInTheDocument()
    })

    it('displays dash when all values are null', () => {
      const nullData = [
        createMeasurementDataPoint({
          activePowerWatts: null,
          energyDailyKwh: null,
          irradiance: null,
          metadata: {}
        })
      ]
      render(<KPIGrid data={nullData} />)

      const dashes = screen.getAllByText('--')
      expect(dashes.length).toBe(4)
    })
  })

  describe('temperature extraction', () => {
    it('extracts temperature from various metadata key formats', () => {
      // Each sample has a different temp key format
      // temperature: 25, T_HS: 30, internaltemp: 28, temp: 27, moduleTemp: 32
      // Average: (25 + 30 + 28 + 27 + 32) / 5 = 28.4
      render(<KPIGrid data={TEMPERATURE_FORMAT_SAMPLES} />)

      expect(screen.getByText('28.4')).toBeInTheDocument()
    })

    it('handles missing temperature gracefully', () => {
      const noTempData = [
        createMeasurementDataPoint({ metadata: { otherKey: 'value' } }),
        createMeasurementDataPoint({ metadata: {} })
      ]
      render(<KPIGrid data={noTempData} />)

      // Should show dash for temperature
      const dashes = screen.getAllByText('--')
      expect(dashes.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('value formatting', () => {
    it('formats peak power with 0 decimal places', () => {
      const data = [createMeasurementDataPoint({ activePowerWatts: 5432.789 })]
      render(<KPIGrid data={data} />)

      expect(screen.getByText('5433')).toBeInTheDocument()
    })

    it('formats total energy with 2 decimal places', () => {
      const data = [createMeasurementDataPoint({ energyDailyKwh: 12.3456 })]
      render(<KPIGrid data={data} />)

      expect(screen.getByText('12.35')).toBeInTheDocument()
    })

    it('formats temperature with 1 decimal place', () => {
      const data = [createMeasurementDataPoint({ metadata: { temperature: 25.678 } })]
      render(<KPIGrid data={data} />)

      expect(screen.getByText('25.7')).toBeInTheDocument()
    })

    it('formats irradiance with 0 decimal places', () => {
      const data = [createMeasurementDataPoint({ irradiance: 756.4 })]
      render(<KPIGrid data={data} />)

      expect(screen.getByText('756')).toBeInTheDocument()
    })
  })
})
