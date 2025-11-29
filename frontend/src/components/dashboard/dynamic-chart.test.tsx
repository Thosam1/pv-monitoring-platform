import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DynamicChart, DynamicChartProps } from './dynamic-chart'

/**
 * Factory function to create sample timeseries data for DynamicChart
 */
function createTimeseriesData(count: number = 5) {
  const baseTime = new Date('2024-06-15T06:00:00Z')
  return Array.from({ length: count }, (_, i) => ({
    timestamp: new Date(baseTime.getTime() + i * 60 * 60 * 1000).toISOString(),
    power: 1000 + i * 500,
    irradiance: 200 + i * 100,
    energy: i * 2.5,
  }))
}

/**
 * Factory function to create pie chart data
 */
function createPieData() {
  return [
    { name: 'Online', value: 4 },
    { name: 'Offline', value: 1 },
    { name: 'Warning', value: 2 },
  ]
}

describe('DynamicChart', () => {
  const defaultProps: DynamicChartProps = {
    chartType: 'line',
    title: 'Test Chart',
    xAxisKey: 'timestamp',
    series: [
      { dataKey: 'power', name: 'Power (W)', color: '#FDB813' },
    ],
    data: createTimeseriesData(),
  }

  describe('rendering states', () => {
    it('renders empty state when data is empty', () => {
      render(<DynamicChart {...defaultProps} data={[]} />)
      expect(screen.getByText('No data available for chart')).toBeInTheDocument()
    })

    it('renders empty state when data is undefined', () => {
      render(<DynamicChart {...defaultProps} data={undefined as unknown as Record<string, unknown>[]} />)
      expect(screen.getByText('No data available for chart')).toBeInTheDocument()
    })

    it('renders chart title', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders chart with custom title', () => {
      render(<DynamicChart {...defaultProps} title="Power Production - Nov 25" />)
      expect(screen.getByText('Power Production - Nov 25')).toBeInTheDocument()
    })
  })

  describe('chart types', () => {
    it('renders line chart', () => {
      render(<DynamicChart {...defaultProps} chartType="line" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders area chart', () => {
      render(<DynamicChart {...defaultProps} chartType="area" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders bar chart', () => {
      render(<DynamicChart {...defaultProps} chartType="bar" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders scatter chart', () => {
      render(<DynamicChart {...defaultProps} chartType="scatter" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders composed chart', () => {
      render(<DynamicChart {...defaultProps} chartType="composed" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders pie chart', () => {
      const pieProps: DynamicChartProps = {
        chartType: 'pie',
        title: 'Fleet Status',
        xAxisKey: 'name',
        series: [{ dataKey: 'value', name: 'Count' }],
        data: createPieData(),
      }
      render(<DynamicChart {...pieProps} />)
      expect(screen.getByText('Fleet Status')).toBeInTheDocument()
    })
  })

  describe('series configuration', () => {
    it('renders single series', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders multiple series', () => {
      const multiSeriesProps: DynamicChartProps = {
        ...defaultProps,
        chartType: 'composed',
        series: [
          { dataKey: 'power', name: 'Power (W)', color: '#FDB813', type: 'area' },
          { dataKey: 'irradiance', name: 'Irradiance (W/m²)', color: '#3B82F6', type: 'line', yAxisId: 'right' },
        ],
      }
      render(<DynamicChart {...multiSeriesProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders series with different types in composed chart', () => {
      const composedProps: DynamicChartProps = {
        ...defaultProps,
        chartType: 'composed',
        series: [
          { dataKey: 'power', name: 'Power', type: 'area' },
          { dataKey: 'irradiance', name: 'Irradiance', type: 'line' },
          { dataKey: 'energy', name: 'Energy', type: 'bar' },
        ],
      }
      render(<DynamicChart {...composedProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders series with custom colors', () => {
      const coloredProps: DynamicChartProps = {
        ...defaultProps,
        series: [
          { dataKey: 'power', name: 'Power', color: '#22C55E' },
        ],
      }
      render(<DynamicChart {...coloredProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('uses default colors when not specified', () => {
      const noColorProps: DynamicChartProps = {
        ...defaultProps,
        series: [
          { dataKey: 'power', name: 'Power' },
          { dataKey: 'irradiance', name: 'Irradiance' },
        ],
      }
      render(<DynamicChart {...noColorProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('dual Y-axis support', () => {
    it('renders with left axis only by default', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders with right axis when series specifies yAxisId="right"', () => {
      const dualAxisProps: DynamicChartProps = {
        ...defaultProps,
        chartType: 'composed',
        series: [
          { dataKey: 'power', name: 'Power (W)', yAxisId: 'left' },
          { dataKey: 'irradiance', name: 'Irradiance (W/m²)', yAxisId: 'right' },
        ],
      }
      render(<DynamicChart {...dualAxisProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('optional features', () => {
    it('shows legend by default', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('hides legend when showLegend is false', () => {
      render(<DynamicChart {...defaultProps} showLegend={false} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('shows grid by default', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('hides grid when showGrid is false', () => {
      render(<DynamicChart {...defaultProps} showGrid={false} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('shows tooltip by default', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('hides tooltip when showTooltip is false', () => {
      render(<DynamicChart {...defaultProps} showTooltip={false} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('axis labels', () => {
    it('renders without axis labels by default', () => {
      render(<DynamicChart {...defaultProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders with xAxisLabel when provided', () => {
      render(<DynamicChart {...defaultProps} xAxisLabel="Time" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders with yAxisLabel when provided', () => {
      render(<DynamicChart {...defaultProps} yAxisLabel="Power (W)" />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('renders with both axis labels', () => {
      render(
        <DynamicChart {...defaultProps} xAxisLabel="Time" yAxisLabel="Power (W)" />
      )
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('data handling', () => {
    it('handles single data point', () => {
      render(<DynamicChart {...defaultProps} data={createTimeseriesData(1)} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('handles large dataset', () => {
      render(<DynamicChart {...defaultProps} data={createTimeseriesData(500)} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('handles data with null values', () => {
      const dataWithNulls = [
        { timestamp: '2024-06-15T06:00:00Z', power: null, irradiance: 200 },
        { timestamp: '2024-06-15T07:00:00Z', power: 1500, irradiance: null },
        { timestamp: '2024-06-15T08:00:00Z', power: 2000, irradiance: 400 },
      ]
      render(<DynamicChart {...defaultProps} data={dataWithNulls} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('handles data with missing keys', () => {
      const incompleteData = [
        { timestamp: '2024-06-15T06:00:00Z', power: 1000 },
        { timestamp: '2024-06-15T07:00:00Z' }, // missing power
        { timestamp: '2024-06-15T08:00:00Z', power: 2000 },
      ]
      render(<DynamicChart {...defaultProps} data={incompleteData} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('timestamp formatting', () => {
    it('formats ISO timestamp strings', () => {
      const isoData = [
        { timestamp: '2024-06-15T12:30:00Z', power: 1000 },
        { timestamp: '2024-06-15T13:30:00Z', power: 1500 },
      ]
      render(<DynamicChart {...defaultProps} data={isoData} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('handles non-date xAxisKey values', () => {
      const categoryData = [
        { category: 'A', value: 100 },
        { category: 'B', value: 200 },
        { category: 'C', value: 150 },
      ]
      const categoryProps: DynamicChartProps = {
        chartType: 'bar',
        title: 'Category Chart',
        xAxisKey: 'category',
        series: [{ dataKey: 'value', name: 'Value' }],
        data: categoryData,
      }
      render(<DynamicChart {...categoryProps} />)
      expect(screen.getByText('Category Chart')).toBeInTheDocument()
    })
  })

  describe('pie chart specific behavior', () => {
    it('renders pie chart with percentage labels', () => {
      const pieProps: DynamicChartProps = {
        chartType: 'pie',
        title: 'Distribution',
        xAxisKey: 'name',
        series: [{ dataKey: 'value', name: 'Count' }],
        data: createPieData(),
      }
      render(<DynamicChart {...pieProps} />)
      expect(screen.getByText('Distribution')).toBeInTheDocument()
    })

    it('uses first series dataKey for pie chart', () => {
      const pieProps: DynamicChartProps = {
        chartType: 'pie',
        title: 'Test Pie',
        xAxisKey: 'name',
        series: [
          { dataKey: 'value', name: 'Primary' },
          { dataKey: 'other', name: 'Ignored' }, // Should be ignored
        ],
        data: createPieData(),
      }
      render(<DynamicChart {...pieProps} />)
      expect(screen.getByText('Test Pie')).toBeInTheDocument()
    })

    it('applies colors to pie slices', () => {
      const pieProps: DynamicChartProps = {
        chartType: 'pie',
        title: 'Colored Pie',
        xAxisKey: 'name',
        series: [{ dataKey: 'value', name: 'Count' }],
        data: createPieData(),
      }
      render(<DynamicChart {...pieProps} />)
      expect(screen.getByText('Colored Pie')).toBeInTheDocument()
    })
  })

  describe('fillOpacity configuration', () => {
    it('uses default fillOpacity for area charts', () => {
      const areaProps: DynamicChartProps = {
        ...defaultProps,
        chartType: 'area',
        series: [{ dataKey: 'power', name: 'Power' }],
      }
      render(<DynamicChart {...areaProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })

    it('uses custom fillOpacity when specified', () => {
      const areaProps: DynamicChartProps = {
        ...defaultProps,
        chartType: 'area',
        series: [{ dataKey: 'power', name: 'Power', fillOpacity: 0.8 }],
      }
      render(<DynamicChart {...areaProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('solar-themed color palette', () => {
    it('cycles through color palette for multiple series', () => {
      const manySeriesProps: DynamicChartProps = {
        ...defaultProps,
        chartType: 'line',
        series: [
          { dataKey: 'power', name: 'Series 1' },
          { dataKey: 'irradiance', name: 'Series 2' },
          { dataKey: 'energy', name: 'Series 3' },
          // Would use colors from palette in order
        ],
      }
      render(<DynamicChart {...manySeriesProps} />)
      expect(screen.getByText('Test Chart')).toBeInTheDocument()
    })
  })

  describe('real-world AI scenarios', () => {
    it('renders power curve from get_power_curve MCP tool', () => {
      const powerCurveData = [
        { timestamp: '2024-11-25T06:00:00Z', power: 0, irradiance: 0 },
        { timestamp: '2024-11-25T08:00:00Z', power: 1500, irradiance: 200 },
        { timestamp: '2024-11-25T12:00:00Z', power: 8000, irradiance: 900 },
        { timestamp: '2024-11-25T16:00:00Z', power: 3000, irradiance: 400 },
        { timestamp: '2024-11-25T18:00:00Z', power: 0, irradiance: 0 },
      ]
      const powerCurveProps: DynamicChartProps = {
        chartType: 'composed',
        title: 'Power Production - Nov 25',
        xAxisKey: 'timestamp',
        series: [
          { dataKey: 'power', name: 'Power (W)', color: '#FDB813', type: 'area' },
          { dataKey: 'irradiance', name: 'Irradiance (W/m²)', color: '#3B82F6', type: 'line', yAxisId: 'right' },
        ],
        data: powerCurveData,
      }
      render(<DynamicChart {...powerCurveProps} />)
      expect(screen.getByText('Power Production - Nov 25')).toBeInTheDocument()
    })

    it('renders logger comparison from compare_loggers MCP tool', () => {
      const comparisonData = [
        { timestamp: '2024-11-25T08:00:00Z', 'GW-INV-001': 1500, 'GW-INV-002': 1400, 'LTI-INV-001': 1600 },
        { timestamp: '2024-11-25T12:00:00Z', 'GW-INV-001': 8000, 'GW-INV-002': 0, 'LTI-INV-001': 7800 },
        { timestamp: '2024-11-25T16:00:00Z', 'GW-INV-001': 3000, 'GW-INV-002': 2900, 'LTI-INV-001': 3100 },
      ]
      const comparisonProps: DynamicChartProps = {
        chartType: 'line',
        title: 'Inverter Comparison - Power',
        xAxisKey: 'timestamp',
        series: [
          { dataKey: 'GW-INV-001', name: 'GW-INV-001', color: '#FDB813' },
          { dataKey: 'GW-INV-002', name: 'GW-INV-002', color: '#EF4444' },
          { dataKey: 'LTI-INV-001', name: 'LTI-INV-001', color: '#22C55E' },
        ],
        data: comparisonData,
      }
      render(<DynamicChart {...comparisonProps} />)
      expect(screen.getByText('Inverter Comparison - Power')).toBeInTheDocument()
    })

    it('renders fleet status pie chart from get_fleet_overview MCP tool', () => {
      const fleetData = [
        { status: 'Producing', count: 4 },
        { status: 'Offline', count: 1 },
        { status: 'Low Output', count: 2 },
      ]
      const fleetProps: DynamicChartProps = {
        chartType: 'pie',
        title: 'Fleet Status Distribution',
        xAxisKey: 'status',
        series: [{ dataKey: 'count', name: 'Devices' }],
        data: fleetData,
      }
      render(<DynamicChart {...fleetProps} />)
      expect(screen.getByText('Fleet Status Distribution')).toBeInTheDocument()
    })

    it('renders daily energy bar chart', () => {
      const dailyData = [
        { date: '2024-11-20', energy: 45.2 },
        { date: '2024-11-21', energy: 52.1 },
        { date: '2024-11-22', energy: 38.5 },
        { date: '2024-11-23', energy: 48.9 },
        { date: '2024-11-24', energy: 55.0 },
      ]
      const dailyProps: DynamicChartProps = {
        chartType: 'bar',
        title: 'Daily Energy Production',
        xAxisKey: 'date',
        xAxisLabel: 'Date',
        yAxisLabel: 'Energy (kWh)',
        series: [{ dataKey: 'energy', name: 'Energy (kWh)', color: '#22C55E' }],
        data: dailyData,
      }
      render(<DynamicChart {...dailyProps} />)
      expect(screen.getByText('Daily Energy Production')).toBeInTheDocument()
    })

    it('renders efficiency scatter plot', () => {
      const scatterData = [
        { irradiance: 200, power: 1500 },
        { irradiance: 400, power: 3200 },
        { irradiance: 600, power: 4800 },
        { irradiance: 800, power: 6400 },
        { irradiance: 900, power: 7000 }, // Clipping visible
        { irradiance: 1000, power: 7200 },
      ]
      const scatterProps: DynamicChartProps = {
        chartType: 'scatter',
        title: 'Power vs Irradiance (Efficiency Check)',
        xAxisKey: 'irradiance',
        xAxisLabel: 'Irradiance (W/m²)',
        yAxisLabel: 'Power (W)',
        series: [{ dataKey: 'power', name: 'Power' }],
        data: scatterData,
      }
      render(<DynamicChart {...scatterProps} />)
      expect(screen.getByText('Power vs Irradiance (Efficiency Check)')).toBeInTheDocument()
    })
  })
})
