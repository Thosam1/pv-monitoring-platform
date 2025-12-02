'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LOGGER_CONFIG, type LoggerType } from '@/types/logger';
import { DateRangePicker } from './date-range-picker';

export interface SelectionOption {
  value: string;
  label: string;
  group?: string;
  subtitle?: string;
}

export interface SelectionPromptProps {
  prompt: string;
  options: SelectionOption[];
  selectionType: 'single' | 'multiple';
  inputType?: 'dropdown' | 'date' | 'date-range';
  minDate?: string;
  maxDate?: string;
  onSelect: (values: string[]) => void;
  disabled?: boolean;
}

/**
 * Dropdown selection component for standard options.
 */
function DropdownSelection({
  prompt,
  options,
  selectionType,
  onSelect,
  disabled = false,
}: Omit<SelectionPromptProps, 'inputType' | 'minDate' | 'maxDate'>) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group options by their group property
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, SelectionOption[]>();

    for (const option of options) {
      const groupName = option.group || 'Options';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(option);
    }

    return groups;
  }, [options]);

  // Get color for a logger type (if applicable)
  const getLoggerColor = useCallback((_value: string, group?: string): string | null => {
    // Check if the group matches a logger type
    const loggerType = group?.toLowerCase().replace(/\s+/g, '') as LoggerType;
    if (loggerType && LOGGER_CONFIG[loggerType]) {
      return LOGGER_CONFIG[loggerType].color;
    }
    return null;
  }, []);

  const handleOptionClick = useCallback((value: string) => {
    if (hasSubmitted || disabled || isSubmitting) return;

    if (selectionType === 'single') {
      setSelectedValues([value]);
      setIsSubmitting(true);
      setIsOpen(false);
      // Small delay for visual feedback
      setTimeout(() => {
        setHasSubmitted(true);
        setIsSubmitting(false);
        onSelect([value]);
      }, 300);
    } else {
      setSelectedValues((prev) => {
        if (prev.includes(value)) {
          return prev.filter((v) => v !== value);
        }
        return [...prev, value];
      });
    }
  }, [hasSubmitted, disabled, isSubmitting, selectionType, onSelect]);

  const handleSubmitMultiple = useCallback(() => {
    if (selectedValues.length > 0 && !hasSubmitted && !isSubmitting) {
      setIsSubmitting(true);
      setIsOpen(false);
      // Small delay for visual feedback
      setTimeout(() => {
        setHasSubmitted(true);
        setIsSubmitting(false);
        onSelect(selectedValues);
      }, 300);
    }
  }, [selectedValues, hasSubmitted, isSubmitting, onSelect]);

  const getDisplayText = useCallback(() => {
    if (hasSubmitted) {
      const selectedLabels = options
        .filter((o) => selectedValues.includes(o.value))
        .map((o) => o.label);
      return selectedLabels.join(', ');
    }
    if (selectedValues.length === 0) {
      return 'Select an option...';
    }
    if (selectionType === 'single') {
      return options.find((o) => o.value === selectedValues[0])?.label || 'Select...';
    }
    return `${selectedValues.length} selected`;
  }, [hasSubmitted, options, selectedValues, selectionType]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="my-3 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <p className="mb-3 text-sm font-medium text-foreground">{prompt}</p>

      <div className="relative">
        <motion.button
          type="button"
          onClick={() => !hasSubmitted && !disabled && !isSubmitting && setIsOpen(!isOpen)}
          disabled={hasSubmitted || disabled || isSubmitting}
          whileHover={!hasSubmitted && !isSubmitting ? { scale: 1.01 } : {}}
          whileTap={!hasSubmitted && !isSubmitting ? { scale: 0.99 } : {}}
          className={cn(
            'flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-sm transition-all duration-200',
            hasSubmitted
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : isSubmitting
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-input bg-background hover:border-primary/50 hover:bg-accent',
            (hasSubmitted || disabled || isSubmitting) && 'cursor-not-allowed'
          )}
        >
          <span className={cn(
            'flex items-center',
            hasSubmitted ? 'text-green-700 dark:text-green-300' :
            isSubmitting ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'
          )}>
            {hasSubmitted && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 25 }}
              >
                <Check className="mr-2 h-4 w-4" />
              </motion.span>
            )}
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {getDisplayText()}
          </span>
          {!hasSubmitted && !isSubmitting && (
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          )}
        </motion.button>

        <AnimatePresence>
          {isOpen && !hasSubmitted && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg"
            >
              {Array.from(groupedOptions.entries()).map(([groupName, groupOptions], groupIndex) => (
                <div key={groupName}>
                  {groupIndex > 0 && <div className="border-t border-border" />}
                  <div className="sticky top-0 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    {groupName}
                  </div>
                  {groupOptions.map((option) => {
                    const isSelected = selectedValues.includes(option.value);
                    const colorClass = getLoggerColor(option.value, option.group);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleOptionClick(option.value)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                          isSelected
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-accent/50'
                        )}
                      >
                        {colorClass && (
                          <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', colorClass)} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{option.label}</div>
                          {option.subtitle && (
                            <div className="truncate text-xs text-muted-foreground">
                              {option.subtitle}
                            </div>
                          )}
                        </div>
                        {selectionType === 'multiple' && isSelected && (
                          <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}

              {selectionType === 'multiple' && selectedValues.length > 0 && (
                <div className="sticky bottom-0 border-t border-border bg-popover p-2">
                  <button
                    type="button"
                    onClick={handleSubmitMultiple}
                    className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Confirm Selection ({selectedValues.length})
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * Interactive selection prompt component.
 * Renders a dropdown for standard selection, or a date picker for date inputs.
 */
export function SelectionPrompt({
  prompt,
  options,
  selectionType,
  inputType = 'dropdown',
  minDate,
  maxDate,
  onSelect,
  disabled = false,
}: SelectionPromptProps) {
  // Handle date selection callback
  const handleDateSelect = useCallback((value: string | { start: string; end: string }) => {
    // Convert to string array format for consistency
    const valueStr = typeof value === 'string' ? value : `${value.start}:${value.end}`;
    onSelect([valueStr]);
  }, [onSelect]);

  // Delegate to DateRangePicker for date-related inputs
  if (inputType === 'date' || inputType === 'date-range') {
    return (
      <DateRangePicker
        prompt={prompt}
        minDate={minDate}
        maxDate={maxDate}
        mode={inputType === 'date' ? 'single' : 'range'}
        presets={options.map((o) => ({
          value: o.value,
          label: o.label,
          subtitle: o.subtitle,
        }))}
        onSelect={handleDateSelect}
        disabled={disabled}
      />
    );
  }

  // Standard dropdown rendering
  return (
    <DropdownSelection
      prompt={prompt}
      options={options}
      selectionType={selectionType}
      onSelect={onSelect}
      disabled={disabled}
    />
  );
}
