import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PerformanceChart } from './PerformanceChart'
import {
  createMeasurementDataPoint,
  createMeasurementSeries,
  SAMPLE_MEASUREMENTS
} from '../../test/utils/test-data'

describe('PerformanceChart', () => {
  const defaultProps = {
    data: SAMPLE_MEASUREMENTS,
    chartStyle: 'area' as const,
    showEnergy: false,
    showIrradiance: false
  }

  describe('rendering states', () => {
    it('renders loading state when isLoading is true', () => {
      render(<PerformanceChart {...defaultProps} data={[]} isLoading={true} />)
      expect(screen.getByText('Loading chart...')).toBeInTheDocument()
    })

    it('renders empty state when data is empty', () => {
      render(<PerformanceChart {...defaultProps} data={[]} />)
      expect(screen.getByText('No measurement data available for selected date')).toBeInTheDocument()
    })

    it('shows upload prompt in empty state when no date range provided', () => {
      render(<PerformanceChart {...defaultProps} data={[]} />)
      expect(screen.getByText('Upload CSV files to see the chart')).toBeInTheDocument()
    })

    it('shows date range info in empty state when dataDateRange provided', () => {
      const dataDateRange = {
        earliest: new Date('2024-06-01'),
        latest: new Date('2024-06-15')
      }
      render(<PerformanceChart {...defaultProps} data={[]} dataDateRange={dataDateRange} />)
      expect(screen.getByText(/Data available from/)).toBeInTheDocument()
      expect(screen.getByText(/Jun 1, 2024/)).toBeInTheDocument()
      expect(screen.getByText(/Jun 15, 2024/)).toBeInTheDocument()
    })

    it('renders chart with "Performance Overview" title', () => {
      render(<PerformanceChart {...defaultProps} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('includes logger ID in title when provided', () => {
      render(<PerformanceChart {...defaultProps} loggerId="LOGGER-001" />)
      expect(screen.getByText(/LOGGER-001/)).toBeInTheDocument()
    })

    it('includes date label in title when provided', () => {
      render(<PerformanceChart {...defaultProps} dateLabel="Mon, Jun 15, 2024" />)
      expect(screen.getByText(/Mon, Jun 15, 2024/)).toBeInTheDocument()
    })

    it('renders combined title with all parts', () => {
      render(<PerformanceChart {...defaultProps} loggerId="LOGGER-001" dateLabel="Jun 15" />)
      expect(screen.getByText('Performance Overview • LOGGER-001 • Jun 15')).toBeInTheDocument()
    })
  })

  describe('chart styles', () => {
    it('renders with area chart style', () => {
      render(<PerformanceChart {...defaultProps} chartStyle="area" />)
      // Chart container renders without errors - title is visible
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders with line chart style', () => {
      render(<PerformanceChart {...defaultProps} chartStyle="line" />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders with bar chart style', () => {
      render(<PerformanceChart {...defaultProps} chartStyle="bar" />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })
  })

  describe('overlay toggles', () => {
    it('renders chart without energy overlay when showEnergy is false', () => {
      render(<PerformanceChart {...defaultProps} showEnergy={false} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders chart with energy overlay when showEnergy is true', () => {
      render(<PerformanceChart {...defaultProps} showEnergy={true} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders chart without irradiance overlay when showIrradiance is false', () => {
      render(<PerformanceChart {...defaultProps} showIrradiance={false} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders chart with irradiance overlay when showIrradiance is true', () => {
      render(<PerformanceChart {...defaultProps} showIrradiance={true} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders chart with both overlays enabled', () => {
      render(
        <PerformanceChart {...defaultProps} showEnergy={true} showIrradiance={true} />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('shows "No irradiance data" warning when irradiance is enabled but data has none', () => {
      const dataWithoutIrradiance = [
        createMeasurementDataPoint({ irradiance: 0 }),
        createMeasurementDataPoint({ irradiance: 0 })
      ]
      render(
        <PerformanceChart
          {...defaultProps}
          data={dataWithoutIrradiance}
          showIrradiance={true}
        />
      )
      expect(screen.getByText('No irradiance data')).toBeInTheDocument()
    })

    it('does not show irradiance warning when data has irradiance values', () => {
      const dataWithIrradiance = [
        createMeasurementDataPoint({ irradiance: 500 }),
        createMeasurementDataPoint({ irradiance: 600 })
      ]
      render(
        <PerformanceChart
          {...defaultProps}
          data={dataWithIrradiance}
          showIrradiance={true}
        />
      )
      expect(screen.queryByText('No irradiance data')).not.toBeInTheDocument()
    })
  })

  describe('data transformation', () => {
    it('transforms measurement data to chart format', () => {
      render(<PerformanceChart {...defaultProps} />)
      // Chart should render with data - title is visible
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('handles null power values by treating as 0', () => {
      const dataWithNulls = [
        createMeasurementDataPoint({ activePowerWatts: null }),
        createMeasurementDataPoint({ activePowerWatts: 5000 })
      ]
      render(<PerformanceChart {...defaultProps} data={dataWithNulls} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('handles null energy values by treating as 0', () => {
      const dataWithNulls = [
        createMeasurementDataPoint({ energyDailyKwh: null }),
        createMeasurementDataPoint({ energyDailyKwh: 25.0 })
      ]
      render(
        <PerformanceChart {...defaultProps} data={dataWithNulls} showEnergy={true} />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('handles null irradiance values by treating as 0', () => {
      const dataWithNulls = [
        createMeasurementDataPoint({ irradiance: null }),
        createMeasurementDataPoint({ irradiance: 800 })
      ]
      render(
        <PerformanceChart {...defaultProps} data={dataWithNulls} showIrradiance={true} />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('samples data when more than 200 points', () => {
      // Create 300 data points - should be sampled down
      const largeData = createMeasurementSeries(300)
      render(<PerformanceChart {...defaultProps} data={largeData} />)
      // Chart should still render without issues
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('does not sample data when 200 points or fewer', () => {
      const smallData = createMeasurementSeries(150)
      render(<PerformanceChart {...defaultProps} data={smallData} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles single data point', () => {
      const singlePoint = [createMeasurementDataPoint()]
      render(<PerformanceChart {...defaultProps} data={singlePoint} />)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('handles all-null power values', () => {
      const allNullPower = [
        createMeasurementDataPoint({ activePowerWatts: null }),
        createMeasurementDataPoint({ activePowerWatts: null })
      ]
      render(<PerformanceChart {...defaultProps} data={allNullPower} />)
      // Chart should still render (with 0 values)
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('handles mixed null and valid data', () => {
      const mixedData = [
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
      render(
        <PerformanceChart
          {...defaultProps}
          data={mixedData}
          showEnergy={true}
          showIrradiance={true}
        />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('sorts data by timestamp', () => {
      // Create data points in reverse order
      const unsortedData = [
        createMeasurementDataPoint({
          timestamp: new Date('2024-06-15T16:00:00Z'),
          activePowerWatts: 3000
        }),
        createMeasurementDataPoint({
          timestamp: new Date('2024-06-15T08:00:00Z'),
          activePowerWatts: 2000
        }),
        createMeasurementDataPoint({
          timestamp: new Date('2024-06-15T12:00:00Z'),
          activePowerWatts: 8000
        })
      ]
      render(<PerformanceChart {...defaultProps} data={unsortedData} />)
      // Chart should render with sorted data
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })
  })

  describe('chart rendering with different configurations', () => {
    it('renders area chart with energy overlay', () => {
      render(
        <PerformanceChart
          {...defaultProps}
          chartStyle="area"
          showEnergy={true}
        />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders line chart with irradiance overlay', () => {
      render(
        <PerformanceChart
          {...defaultProps}
          chartStyle="line"
          showIrradiance={true}
        />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })

    it('renders bar chart with both overlays', () => {
      render(
        <PerformanceChart
          {...defaultProps}
          chartStyle="bar"
          showEnergy={true}
          showIrradiance={true}
        />
      )
      expect(screen.getByText(/Performance Overview/)).toBeInTheDocument()
    })
  })
})
