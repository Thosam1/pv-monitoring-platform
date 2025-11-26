import { CalendarIcon } from 'lucide-react'
import { format, parse } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

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

export function DashboardControls({
  customDate,
  onCustomDateChange,
  chartStyle,
  onChartStyleChange,
  showEnergy,
  onShowEnergyChange,
  showIrradiance,
  onShowIrradianceChange,
}: Readonly<DashboardControlsProps>) {
  // Convert string date to Date object for Calendar
  const selectedDate = customDate
    ? parse(customDate, 'yyyy-MM-dd', new Date())
    : undefined

  // Handle date selection from Calendar
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      onCustomDateChange(format(date, 'yyyy-MM-dd'))
    } else {
      onCustomDateChange(null)
    }
  }

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-end gap-6">
          {/* Date Picker */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Custom Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-[200px] justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Chart Style Select */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Chart Style</Label>
            <Select value={chartStyle} onValueChange={(v) => onChartStyleChange(v as ChartStyle)}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Style" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="area">Area</SelectItem>
                <SelectItem value="line">Line</SelectItem>
                <SelectItem value="bar">Bar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Overlay Toggles */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs text-muted-foreground">Overlays</Label>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="energy-toggle"
                  checked={showEnergy}
                  onCheckedChange={onShowEnergyChange}
                />
                <Label htmlFor="energy-toggle" className="text-sm cursor-pointer">
                  Energy (kWh)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="irradiance-toggle"
                  checked={showIrradiance}
                  onCheckedChange={onShowIrradianceChange}
                />
                <Label htmlFor="irradiance-toggle" className="text-sm cursor-pointer">
                  Irradiance
                </Label>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
