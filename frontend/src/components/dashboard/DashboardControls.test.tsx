import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardControls } from './DashboardControls'

describe('DashboardControls', () => {
  const defaultProps = {
    customDate: null,
    onCustomDateChange: vi.fn(),
    chartStyle: 'area' as const,
    onChartStyleChange: vi.fn(),
    showEnergy: false,
    onShowEnergyChange: vi.fn(),
    showIrradiance: false,
    onShowIrradianceChange: vi.fn()
  }

  const renderComponent = (props = {}) => {
    const mergedProps = { ...defaultProps, ...props }
    return render(<DashboardControls {...mergedProps} />)
  }

  describe('rendering', () => {
    it('renders all control sections', () => {
      renderComponent()

      expect(screen.getByText('Custom Date')).toBeInTheDocument()
      expect(screen.getByText('Chart Style')).toBeInTheDocument()
      expect(screen.getByText('Overlays')).toBeInTheDocument()
    })

    it('renders date input', () => {
      renderComponent()

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      expect(dateInput).toBeInTheDocument()
    })

    it('renders chart style dropdown button', () => {
      renderComponent()

      expect(screen.getByRole('button', { name: /chart style/i })).toBeInTheDocument()
    })

    it('renders overlay checkboxes', () => {
      renderComponent()

      expect(screen.getByText('Energy (kWh)')).toBeInTheDocument()
      expect(screen.getByText('Irradiance')).toBeInTheDocument()
    })
  })

  describe('date picker', () => {
    it('displays empty value when customDate is null', () => {
      renderComponent({ customDate: null })

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      expect(dateInput.value).toBe('')
    })

    it('displays custom date when provided', () => {
      renderComponent({ customDate: '2024-06-15' })

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      expect(dateInput.value).toBe('2024-06-15')
    })

    it('calls onCustomDateChange when date is selected', async () => {
      const onCustomDateChange = vi.fn()
      renderComponent({ onCustomDateChange })

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      await userEvent.clear(dateInput)
      await userEvent.type(dateInput, '2024-06-20')

      expect(onCustomDateChange).toHaveBeenCalled()
    })

    it('calls onCustomDateChange with null when date is cleared', async () => {
      const onCustomDateChange = vi.fn()
      renderComponent({ customDate: '2024-06-15', onCustomDateChange })

      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
      await userEvent.clear(dateInput)

      expect(onCustomDateChange).toHaveBeenLastCalledWith(null)
    })
  })

  describe('chart style dropdown', () => {
    it('shows current chart style', () => {
      renderComponent({ chartStyle: 'line' })

      expect(screen.getByRole('button', { name: /chart style/i })).toHaveTextContent('Line')
    })

    it('opens dropdown on click', async () => {
      renderComponent()

      const button = screen.getByRole('button', { name: /chart style/i })
      await userEvent.click(button)

      // Dropdown should show all options (use getAllByRole since trigger button also matches)
      const buttons = screen.getAllByRole('button')
      const buttonTexts = buttons.map(b => b.textContent)
      expect(buttonTexts).toContain('Area')
      expect(buttonTexts).toContain('Line')
      expect(buttonTexts).toContain('Bar')
    })

    it('calls onChartStyleChange when option is selected', async () => {
      const onChartStyleChange = vi.fn()
      renderComponent({ chartStyle: 'area', onChartStyleChange })

      // Open dropdown
      const button = screen.getByRole('button', { name: /chart style/i })
      await userEvent.click(button)

      // Select Line option
      const lineOption = screen.getByRole('button', { name: 'Line' })
      await userEvent.click(lineOption)

      expect(onChartStyleChange).toHaveBeenCalledWith('line')
    })

    it('closes dropdown after selection', async () => {
      renderComponent()

      // Open dropdown
      const button = screen.getByRole('button', { name: /chart style/i })
      await userEvent.click(button)

      // Select option
      const lineOption = screen.getByRole('button', { name: 'Line' })
      await userEvent.click(lineOption)

      // Dropdown should close (Line option button should not be visible)
      expect(screen.queryByRole('button', { name: 'Bar' })).not.toBeInTheDocument()
    })
  })

  describe('overlay toggles', () => {
    it('shows unchecked state for energy when showEnergy is false', () => {
      renderComponent({ showEnergy: false })

      const checkbox = screen.getByRole('checkbox', { name: /energy/i })
      expect(checkbox).not.toBeChecked()
    })

    it('shows checked state for energy when showEnergy is true', () => {
      renderComponent({ showEnergy: true })

      const checkbox = screen.getByRole('checkbox', { name: /energy/i })
      expect(checkbox).toBeChecked()
    })

    it('calls onShowEnergyChange when energy checkbox is clicked', async () => {
      const onShowEnergyChange = vi.fn()
      renderComponent({ showEnergy: false, onShowEnergyChange })

      const checkbox = screen.getByRole('checkbox', { name: /energy/i })
      await userEvent.click(checkbox)

      expect(onShowEnergyChange).toHaveBeenCalledWith(true)
    })

    it('shows unchecked state for irradiance when showIrradiance is false', () => {
      renderComponent({ showIrradiance: false })

      const checkbox = screen.getByRole('checkbox', { name: /irradiance/i })
      expect(checkbox).not.toBeChecked()
    })

    it('shows checked state for irradiance when showIrradiance is true', () => {
      renderComponent({ showIrradiance: true })

      const checkbox = screen.getByRole('checkbox', { name: /irradiance/i })
      expect(checkbox).toBeChecked()
    })

    it('calls onShowIrradianceChange when irradiance checkbox is clicked', async () => {
      const onShowIrradianceChange = vi.fn()
      renderComponent({ showIrradiance: false, onShowIrradianceChange })

      const checkbox = screen.getByRole('checkbox', { name: /irradiance/i })
      await userEvent.click(checkbox)

      expect(onShowIrradianceChange).toHaveBeenCalledWith(true)
    })
  })
})
