'use client';

import { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay, subDays, isSameDay, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { formatDateUTC } from '@/lib/date-utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { DateRange } from 'react-day-picker';

export interface DatePreset {
  value: string;
  label: string;
  subtitle?: string;
}

export interface DateRangePickerProps {
  prompt: string;
  minDate?: string;
  maxDate?: string;
  mode: 'single' | 'range';
  presets?: DatePreset[];
  onSelect: (value: string | { start: string; end: string }) => void;
  disabled?: boolean;
}

/**
 * Calendar-based date picker for the AI chat interface.
 * Supports single date and date range selection with min/max constraints.
 */
export function DateRangePicker({
  prompt,
  minDate,
  maxDate,
  mode,
  presets = [],
  onSelect,
  disabled = false,
}: Readonly<DateRangePickerProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>();

  // Parse min/max dates with validation and fallback to current date
  const minDateParsed = useMemo(() => {
    if (!minDate) return undefined;
    const parsed = parseISO(minDate);
    return isValid(parsed) ? parsed : undefined;
  }, [minDate]);

  const maxDateParsed = useMemo(() => {
    if (!maxDate) return undefined;
    const parsed = parseISO(maxDate);
    return isValid(parsed) ? parsed : undefined;
  }, [maxDate]);

  // Calendar default month - fallback to today if maxDate not available
  const calendarDefaultMonth = useMemo(() => {
    return maxDateParsed || new Date();
  }, [maxDateParsed]);

  // Calculate data span in days
  const dataSpanDays = useMemo(() => {
    if (!minDateParsed || !maxDateParsed) return 0;
    return Math.ceil((maxDateParsed.getTime() - minDateParsed.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [minDateParsed, maxDateParsed]);

  // Disabled date matcher - dates outside the range
  const disabledDates = useMemo(() => {
    return (date: Date) => {
      const day = startOfDay(date);
      if (minDateParsed && day < startOfDay(minDateParsed)) return true;
      if (maxDateParsed && day > endOfDay(maxDateParsed)) return true;
      return false;
    };
  }, [minDateParsed, maxDateParsed]);

  // Handle preset click
  const handlePresetClick = (preset: DatePreset) => {
    if (hasSubmitted || disabled || isSubmitting) return;

    setIsSubmitting(true);
    setIsOpen(false);

    setTimeout(() => {
      setHasSubmitted(true);
      setIsSubmitting(false);
      onSelect(preset.value);
    }, 300);
  };

  // Handle single date selection
  const handleSingleDateSelect = (date: Date | undefined) => {
    if (!date || hasSubmitted || disabled || isSubmitting) return;

    setSelectedDate(date);
    setIsSubmitting(true);
    setIsOpen(false);

    setTimeout(() => {
      setHasSubmitted(true);
      setIsSubmitting(false);
      onSelect(format(date, 'yyyy-MM-dd'));
    }, 300);
  };

  // Handle range selection
  const handleRangeSelect = (range: DateRange | undefined) => {
    if (hasSubmitted || disabled || isSubmitting) return;
    setSelectedRange(range);
  };

  // Submit date range
  const handleSubmitRange = () => {
    if (!selectedRange?.from || hasSubmitted || isSubmitting) return;

    setIsSubmitting(true);
    setIsOpen(false);

    setTimeout(() => {
      setHasSubmitted(true);
      setIsSubmitting(false);

      const start = format(selectedRange.from!, 'yyyy-MM-dd');
      const end = selectedRange.to ? format(selectedRange.to, 'yyyy-MM-dd') : start;
      onSelect({ start, end });
    }, 300);
  };

  // Get display text
  const getDisplayText = () => {
    if (hasSubmitted) {
      if (mode === 'single' && selectedDate) {
        return format(selectedDate, 'MMMM d, yyyy');
      }
      if (mode === 'range' && selectedRange?.from) {
        const start = format(selectedRange.from, 'MMM d, yyyy');
        const end = selectedRange.to ? format(selectedRange.to, 'MMM d, yyyy') : start;
        return `${start} - ${end}`;
      }
      // Check if a preset was selected
      const selectedPreset = presets.find((p) => p.value === 'submitted');
      if (selectedPreset) return selectedPreset.label;
    }
    return mode === 'single' ? 'Pick a date' : 'Select date range';
  };

  // Generate smart presets based on data availability
  const smartPresets = useMemo(() => {
    if (presets.length > 0) return presets;
    if (!maxDateParsed || !minDateParsed) return [];

    const generated: DatePreset[] = [];
    const latestDateStr = format(maxDateParsed, 'yyyy-MM-dd');
    const earliestDateStr = format(minDateParsed, 'yyyy-MM-dd');

    // Always add "Latest"
    generated.push({
      value: latestDateStr,
      label: 'Latest',
      subtitle: format(maxDateParsed, 'MMM d, yyyy'),
    });

    if (dataSpanDays > 1) {
      // Add "Yesterday" if it's within range
      const yesterday = subDays(maxDateParsed, 1);
      if (isWithinInterval(yesterday, { start: minDateParsed, end: maxDateParsed })) {
        generated.push({
          value: format(yesterday, 'yyyy-MM-dd'),
          label: 'Previous',
          subtitle: format(yesterday, 'MMM d, yyyy'),
        });
      }
    }

    if (dataSpanDays >= 7) {
      generated.push({
        value: `last_7_days`,
        label: 'Last 7 Days',
        subtitle: 'Past week',
      });
    }

    if (dataSpanDays >= 14) {
      generated.push({
        value: `last_14_days`,
        label: 'Last 14 Days',
        subtitle: 'Past 2 weeks',
      });
    }

    if (dataSpanDays >= 30) {
      generated.push({
        value: `last_30_days`,
        label: 'Last 30 Days',
        subtitle: 'Past month',
      });
    }

    // Add "All Available" if span is reasonable
    if (dataSpanDays > 1 && dataSpanDays <= 90 && !isSameDay(minDateParsed, maxDateParsed)) {
      generated.push({
        value: `${earliestDateStr}:${latestDateStr}`,
        label: 'All Available',
        subtitle: `${format(minDateParsed, 'MMM d')} - ${format(maxDateParsed, 'MMM d, yyyy')}`,
      });
    }

    return generated;
  }, [presets, minDateParsed, maxDateParsed, dataSpanDays]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="my-3 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <p className="mb-3 text-sm font-medium text-foreground">{prompt}</p>

      {/* Data availability info */}
      {minDateParsed && maxDateParsed && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <CalendarIcon className="h-3.5 w-3.5" />
          <span>
            Data available from <span className="font-medium text-foreground">{formatDateUTC(minDateParsed)}</span>
            {' to '}
            <span className="font-medium text-foreground">{formatDateUTC(maxDateParsed)}</span>
            {' '}({dataSpanDays} {dataSpanDays === 1 ? 'day' : 'days'})
          </span>
        </div>
      )}

      {/* Quick presets */}
      {smartPresets.length > 0 && !hasSubmitted && (
        <div className="mb-3 flex flex-wrap gap-2">
          {smartPresets.map((preset) => (
            <motion.button
              key={preset.value}
              type="button"
              onClick={() => handlePresetClick(preset)}
              disabled={hasSubmitted || disabled || isSubmitting}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                'border-border bg-background hover:border-primary/50 hover:bg-accent',
                (hasSubmitted || disabled || isSubmitting) && 'cursor-not-allowed opacity-50'
              )}
            >
              <span className="block">{preset.label}</span>
              {preset.subtitle && (
                <span className="block text-muted-foreground">{preset.subtitle}</span>
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* Calendar picker */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <motion.div
            whileHover={!hasSubmitted && !isSubmitting ? { scale: 1.01 } : {}}
            whileTap={!hasSubmitted && !isSubmitting ? { scale: 0.99 } : {}}
          >
            <Button
              variant="outline"
              disabled={hasSubmitted || disabled || isSubmitting}
              className={cn(
                'w-full justify-start text-left font-normal',
                hasSubmitted && 'border-green-500 bg-green-50 dark:bg-green-900/20',
                isSubmitting && 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
                !selectedDate && !selectedRange && 'text-muted-foreground'
              )}
            >
              {hasSubmitted && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                >
                  <Check className="mr-2 h-4 w-4 text-green-600" />
                </motion.span>
              )}
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" />}
              {!hasSubmitted && !isSubmitting && <CalendarIcon className="mr-2 h-4 w-4" />}
              <span className={cn(
                hasSubmitted && 'text-green-700 dark:text-green-300',
                isSubmitting && 'text-blue-700 dark:text-blue-300'
              )}>
                {getDisplayText()}
              </span>
            </Button>
          </motion.div>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0" align="start">
          <AnimatePresence>
            {mode === 'single' ? (
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleSingleDateSelect}
                disabled={disabledDates}
                defaultMonth={calendarDefaultMonth}
                initialFocus
              />
            ) : (
              <div className="p-0">
                <Calendar
                  mode="range"
                  selected={selectedRange}
                  onSelect={handleRangeSelect}
                  disabled={disabledDates}
                  defaultMonth={calendarDefaultMonth}
                  numberOfMonths={1}
                  initialFocus
                />
                {selectedRange?.from && (
                  <div className="border-t border-border p-2">
                    <Button
                      onClick={handleSubmitRange}
                      disabled={!selectedRange.from || isSubmitting}
                      className="w-full"
                      size="sm"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Selecting...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Confirm Selection
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </AnimatePresence>
        </PopoverContent>
      </Popover>
    </motion.div>
  );
}
