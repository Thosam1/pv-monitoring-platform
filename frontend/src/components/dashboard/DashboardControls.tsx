import { cn } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

export type DateRange = 'day'
export type ChartStyle = 'area' | 'line' | 'bar'

interface DashboardControlsProps {
  customDate: string | null
  onCustomDateChange: (date: string | null) => void
  chartStyle: ChartStyle
  onChartStyleChange: (style: ChartStyle) => void
  showEnergy: boolean
  onShowEnergyChange: (show: boolean) => void
  showIrradiance: boolean
  onShowIrradianceChange: (show: boolean) => void
}

const CHART_STYLE_OPTIONS: { value: ChartStyle; label: string }[] = [
  { value: 'area', label: 'Area' },
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' }
]

export function DashboardControls({
  customDate,
  onCustomDateChange,
  chartStyle,
  onChartStyleChange,
  showEnergy,
  onShowEnergyChange,
  showIrradiance,
  onShowIrradianceChange
}: Readonly<DashboardControlsProps>) {
  const [styleDropdownOpen, setStyleDropdownOpen] = useState(false)

  const selectedStyleLabel = CHART_STYLE_OPTIONS.find((opt) => opt.value === chartStyle)?.label ?? 'Area'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <div className="flex flex-wrap items-center gap-6">
        {/* Custom Date Picker */}
        <div className="flex flex-col gap-2">
          <label htmlFor="custom-date-picker" className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Custom Date
          </label>
          <input
            id="custom-date-picker"
            type="date"
            value={customDate ?? ''}
            onChange={(e) => onCustomDateChange(e.target.value || null)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer",
              "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600",
              "text-gray-900 dark:text-white",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              customDate && "ring-2 ring-blue-500"
            )}
          />
        </div>

        {/* Chart Style Dropdown */}
        <div className="flex flex-col gap-2">
          <label htmlFor="chart-style-button" className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Chart Style
          </label>
          <div className="relative">
            <button
              id="chart-style-button"
              type="button"
              onClick={() => setStyleDropdownOpen(!styleDropdownOpen)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer",
                "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600",
                "hover:border-blue-400 dark:hover:border-blue-500",
                "text-gray-900 dark:text-white text-sm font-medium"
              )}
            >
              {selectedStyleLabel}
              <ChevronDown className={cn(
                "w-4 h-4 transition-transform",
                styleDropdownOpen && "rotate-180"
              )} />
            </button>

            {styleDropdownOpen && (
              <div className="absolute left-0 mt-1 w-32 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden z-10">
                {CHART_STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onChartStyleChange(option.value)
                      setStyleDropdownOpen(false)
                    }}
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm transition-colors cursor-pointer",
                      "hover:bg-gray-100 dark:hover:bg-gray-600",
                      chartStyle === option.value
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                        : "text-gray-700 dark:text-gray-200"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Metric Toggles */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-gray-500 dark:text-gray-400">
            Overlays
          </legend>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showEnergy}
                onChange={(e) => onShowEnergyChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">Energy (kWh)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showIrradiance}
                onChange={(e) => onShowIrradianceChange(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-yellow-500 focus:ring-yellow-500 cursor-pointer"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">Irradiance</span>
            </label>
          </div>
        </fieldset>
      </div>
    </div>
  )
}
