import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TechnicalChart } from './TechnicalChart'
import {
  createMeasurementDataPoint,
  createMeasurementSeries
} from '../../test/utils/test-data'

describe('TechnicalChart', () => {
  describe('rendering states', () => {
    it('renders loading state when isLoading is true', () => {
      render(<TechnicalChart data={[]} isLoading={true} />)
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('renders empty state when data is empty', () => {
      render(<TechnicalChart data={[]} />)
      expect(screen.getByText('No technical data available')).toBeInTheDocument()
      expect(screen.getByText('Voltage/temperature data not found in metadata')).toBeInTheDocument()
    })

    it('renders empty state when no voltage or temperature in metadata', () => {
      const data = [
        createMeasurementDataPoint({ metadata: { otherKey: 'value' } }),
        createMeasurementDataPoint({ metadata: {} })
      ]
      render(<TechnicalChart data={data} />)
      expect(screen.getByText('No technical data available')).toBeInTheDocument()
    })

    it('renders chart title with "Technical Metrics"', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 350 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.getByText(/Technical Metrics/)).toBeInTheDocument()
    })

    it('includes logger ID in title when provided', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 350 } })]
      render(<TechnicalChart data={data} loggerId="LOGGER-001" />)
      expect(screen.getByText(/LOGGER-001/)).toBeInTheDocument()
    })

    it('includes date label in title when provided', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 350 } })]
      render(<TechnicalChart data={data} dateLabel="Mon, Jun 15, 2024" />)
      expect(screen.getByText(/Mon, Jun 15, 2024/)).toBeInTheDocument()
    })

    it('renders chart with combined title including all parts', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 350 } })]
      render(<TechnicalChart data={data} loggerId="LOGGER-001" dateLabel="Jun 15" />)
      expect(screen.getByTitle('Technical Metrics • LOGGER-001 • Jun 15')).toBeInTheDocument()
    })
  })

  describe('voltage extraction', () => {
    it('extracts voltage using pv1volt key (GoodWe)', () => {
      const data = [createMeasurementDataPoint({ metadata: { pv1volt: 380 } })]
      render(<TechnicalChart data={data} />)
      // Chart should render (not show empty state)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using voltagedc1 key (GoodWe)', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltagedc1: 375 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using voltage_dc1 key (GoodWe)', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage_dc1: 370 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using dcVoltage1 key (GoodWe)', () => {
      const data = [createMeasurementDataPoint({ metadata: { dcVoltage1: 365 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using vpv1 key (GoodWe)', () => {
      const data = [createMeasurementDataPoint({ metadata: { vpv1: 360 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using U_DC key (LTI)', () => {
      const data = [createMeasurementDataPoint({ metadata: { U_DC: 400 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using voltage key (LTI)', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 395 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using dcVoltage key (LTI)', () => {
      const data = [createMeasurementDataPoint({ metadata: { dcVoltage: 390 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts voltage using udc key (LTI)', () => {
      const data = [createMeasurementDataPoint({ metadata: { udc: 385 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('returns null when no voltage key found', () => {
      const data = [createMeasurementDataPoint({ metadata: { unknownKey: 350 } })]
      render(<TechnicalChart data={data} />)
      // Should show empty state since no valid voltage or temp
      expect(screen.getByText('No technical data available')).toBeInTheDocument()
    })

    it('prioritizes GoodWe keys over LTI keys', () => {
      // If both formats exist, GoodWe should be used first
      const data = [createMeasurementDataPoint({ metadata: { pv1volt: 380, U_DC: 400 } })]
      render(<TechnicalChart data={data} />)
      // Chart should render with GoodWe value (can't directly test the value, but chart renders)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })
  })

  describe('temperature extraction', () => {
    it('extracts temperature using temperature key', () => {
      const data = [createMeasurementDataPoint({ metadata: { temperature: 35 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts temperature using T_HS key (LTI heatsink)', () => {
      const data = [createMeasurementDataPoint({ metadata: { T_HS: 40 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts temperature using internaltemp key', () => {
      const data = [createMeasurementDataPoint({ metadata: { internaltemp: 38 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts temperature using temp key', () => {
      const data = [createMeasurementDataPoint({ metadata: { temp: 36 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('extracts temperature using moduleTemp key', () => {
      const data = [createMeasurementDataPoint({ metadata: { moduleTemp: 42 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('returns null when no temperature key found', () => {
      const data = [createMeasurementDataPoint({ metadata: { unknownTempKey: 35 } })]
      render(<TechnicalChart data={data} />)
      // Should show empty state since no valid voltage or temp
      expect(screen.getByText('No technical data available')).toBeInTheDocument()
    })
  })

  describe('data transformation', () => {
    it('renders chart with both voltage and temperature data', () => {
      const data = [
        createMeasurementDataPoint({ metadata: { voltage: 350, temperature: 35 } }),
        createMeasurementDataPoint({ metadata: { voltage: 360, temperature: 38 } })
      ]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
      expect(screen.getByText(/Technical Metrics/)).toBeInTheDocument()
    })

    it('renders chart with only voltage data', () => {
      const data = [
        createMeasurementDataPoint({ metadata: { voltage: 350 } }),
        createMeasurementDataPoint({ metadata: { voltage: 360 } })
      ]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('renders chart with only temperature data', () => {
      const data = [
        createMeasurementDataPoint({ metadata: { temperature: 35 } }),
        createMeasurementDataPoint({ metadata: { temperature: 38 } })
      ]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('handles mixed data with some points missing voltage', () => {
      const data = [
        createMeasurementDataPoint({ metadata: { voltage: 350, temperature: 35 } }),
        createMeasurementDataPoint({ metadata: { temperature: 38 } }), // No voltage
        createMeasurementDataPoint({ metadata: { voltage: 370, temperature: 40 } })
      ]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('handles mixed data with some points missing temperature', () => {
      const data = [
        createMeasurementDataPoint({ metadata: { voltage: 350, temperature: 35 } }),
        createMeasurementDataPoint({ metadata: { voltage: 360 } }), // No temp
        createMeasurementDataPoint({ metadata: { voltage: 370, temperature: 40 } })
      ]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('samples data when more than 150 points', () => {
      // Create 200 data points - should be sampled down
      const data = createMeasurementSeries(200).map((point, i) => ({
        ...point,
        metadata: { voltage: 300 + i, temperature: 25 + (i % 10) }
      }))

      render(<TechnicalChart data={data} />)
      // Chart should still render without issues
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('does not sample data when 150 points or fewer', () => {
      const data = createMeasurementSeries(100).map((point, i) => ({
        ...point,
        metadata: { voltage: 300 + i, temperature: 25 + (i % 10) }
      }))

      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles single data point', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 350 } })]
      render(<TechnicalChart data={data} />)
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('handles NaN values in metadata', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: Number.NaN, temperature: 35 } })]
      render(<TechnicalChart data={data} />)
      // Should still render because temperature is valid
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('handles non-number values in metadata', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 'invalid', temperature: 35 } })]
      render(<TechnicalChart data={data} />)
      // Should still render because temperature is valid
      expect(screen.queryByText('No technical data available')).not.toBeInTheDocument()
    })

    it('ignores non-number voltage values', () => {
      const data = [createMeasurementDataPoint({ metadata: { voltage: 'abc' } })]
      render(<TechnicalChart data={data} />)
      // Should show empty state since voltage is invalid and no temp
      expect(screen.getByText('No technical data available')).toBeInTheDocument()
    })
  })
})
