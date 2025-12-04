'use client';

import { useState, useMemo, useCallback } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { LOGGER_CONFIG, type LoggerType } from '@/types/logger';
import { DateRangePicker } from './date-range-picker';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

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
  // NEW: Pre-fill support for proactive prompting
  contextMessage?: string;
  preSelectedValues?: string[];
  preFilledDateRange?: { start: string; end: string };
  requireConfirmation?: boolean;
  // Multi-select count limits
  minCount?: number;
  maxCount?: number;
}

/**
 * Single-select dropdown using Radix Select with Portal.
 * Supports pre-selection for proactive prompting.
 */
function SingleSelectDropdown({
  prompt,
  options,
  onSelect,
  disabled = false,
  contextMessage,
  preSelectedValues,
  requireConfirmation = false,
}: Omit<SelectionPromptProps, 'inputType' | 'minDate' | 'maxDate' | 'selectionType' | 'preFilledDateRange'>) {
  const [hasSubmitted, setHasSubmitted] = useState(false);
  // Initialize with pre-selected value if provided
  const [selectedValue, setSelectedValue] = useState<string | null>(
    preSelectedValues?.[0] || null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Track if confirmation is needed (when pre-selected)
  const needsConfirmation = requireConfirmation || (preSelectedValues && preSelectedValues.length > 0);

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
  const getLoggerColor = useCallback((group?: string): string | null => {
    const loggerType = group?.toLowerCase().replace(/\s+/g, '') as LoggerType;
    if (loggerType && LOGGER_CONFIG[loggerType]) {
      return LOGGER_CONFIG[loggerType].color;
    }
    return null;
  }, []);

  const handleValueChange = useCallback((value: string) => {
    if (hasSubmitted || disabled || isSubmitting) return;

    setSelectedValue(value);

    // If confirmation is needed, don't auto-submit
    if (needsConfirmation) return;

    setIsSubmitting(true);

    // Small delay for visual feedback
    setTimeout(() => {
      setHasSubmitted(true);
      setIsSubmitting(false);
      onSelect([value]);
    }, 300);
  }, [hasSubmitted, disabled, isSubmitting, onSelect, needsConfirmation]);

  // Handle explicit confirmation
  const handleConfirm = useCallback(() => {
    if (!selectedValue || hasSubmitted || disabled || isSubmitting) return;

    setIsSubmitting(true);

    setTimeout(() => {
      setHasSubmitted(true);
      setIsSubmitting(false);
      onSelect([selectedValue]);
    }, 300);
  }, [selectedValue, hasSubmitted, disabled, isSubmitting, onSelect]);

  const getDisplayValue = useCallback(() => {
    if (!selectedValue) return null;
    const option = options.find((o) => o.value === selectedValue);
    return option?.label || selectedValue;
  }, [selectedValue, options]);

  // Extract form state rendering to avoid nested ternary
  const renderFormState = () => {
    if (hasSubmitted) {
      return (
        <div
          className={cn(
            'flex w-full items-center rounded-md border px-3 py-2.5 text-sm',
            'border-green-500 bg-green-50 dark:bg-green-900/20'
          )}
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="mr-2"
          >
            <Check className="h-4 w-4 text-green-700 dark:text-green-300" />
          </motion.span>
          <span className="text-green-700 dark:text-green-300">{getDisplayValue()}</span>
        </div>
      );
    }

    if (isSubmitting) {
      return (
        <div
          className={cn(
            'flex w-full items-center rounded-md border px-3 py-2.5 text-sm',
            'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          )}
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-700 dark:text-blue-300" />
          <span className="text-blue-700 dark:text-blue-300">{getDisplayValue()}</span>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <Select
          onValueChange={handleValueChange}
          disabled={disabled}
          defaultValue={preSelectedValues?.[0]}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select an option..." />
          </SelectTrigger>
          <SelectContent>
            {Array.from(groupedOptions.entries()).map(([groupName, groupOptions]) => (
              <SelectGroup key={groupName}>
                <SelectLabel>{groupName}</SelectLabel>
                {groupOptions.map((option) => {
                  const colorClass = getLoggerColor(option.group);
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {colorClass && (
                          <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', colorClass)} />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{option.label}</span>
                          {option.subtitle && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {option.subtitle}
                            </span>
                          )}
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {needsConfirmation && selectedValue && (
          <Button onClick={handleConfirm} className="w-full" size="sm">
            Confirm Selection
          </Button>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="my-3 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      {/* Context message (shows detected value info) */}
      {contextMessage && !hasSubmitted && (
        <p className="mb-2 text-sm text-muted-foreground">{contextMessage}</p>
      )}
      <p className="mb-3 text-sm font-medium text-foreground">{prompt}</p>

      {renderFormState()}
    </motion.div>
  );
}

/**
 * Multi-select dropdown using Radix Popover with Portal.
 * Supports pre-selection for proactive prompting.
 * Enforces minCount/maxCount selection limits.
 */
function MultiSelectDropdown({
  prompt,
  options,
  onSelect,
  disabled = false,
  contextMessage,
  preSelectedValues,
  minCount = 1,
  maxCount,
}: Omit<SelectionPromptProps, 'inputType' | 'minDate' | 'maxDate' | 'selectionType' | 'preFilledDateRange' | 'requireConfirmation'>) {
  const [isOpen, setIsOpen] = useState(false);
  // Initialize with pre-selected values if provided
  const [selectedValues, setSelectedValues] = useState<string[]>(preSelectedValues || []);
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
  const getLoggerColor = useCallback((group?: string): string | null => {
    const loggerType = group?.toLowerCase().replace(/\s+/g, '') as LoggerType;
    if (loggerType && LOGGER_CONFIG[loggerType]) {
      return LOGGER_CONFIG[loggerType].color;
    }
    return null;
  }, []);

  const handleOptionToggle = useCallback((value: string) => {
    if (hasSubmitted || disabled || isSubmitting) return;

    setSelectedValues((prev) => {
      // Always allow deselection
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      }
      // Block new selection if max reached
      if (maxCount !== undefined && prev.length >= maxCount) {
        return prev;
      }
      return [...prev, value];
    });
  }, [hasSubmitted, disabled, isSubmitting, maxCount]);

  // Check if minimum selections met (can submit)
  const hasMinSelections = selectedValues.length >= minCount;

  const handleSubmit = useCallback(() => {
    if (hasMinSelections && !hasSubmitted && !isSubmitting) {
      setIsSubmitting(true);
      setIsOpen(false);

      setTimeout(() => {
        setHasSubmitted(true);
        setIsSubmitting(false);
        onSelect(selectedValues);
      }, 300);
    }
  }, [selectedValues, hasSubmitted, isSubmitting, onSelect, hasMinSelections]);

  const getDisplayText = useCallback(() => {
    if (hasSubmitted) {
      const selectedLabels = options
        .filter((o) => selectedValues.includes(o.value))
        .map((o) => o.label);
      return selectedLabels.join(', ');
    }
    if (selectedValues.length === 0) {
      return 'Select options...';
    }
    return `${selectedValues.length} selected`;
  }, [hasSubmitted, options, selectedValues]);

  // Extract form state rendering to avoid nested ternary
  const renderFormState = () => {
    if (hasSubmitted) {
      return (
        <div
          className={cn(
            'flex w-full items-center rounded-md border px-3 py-2.5 text-sm',
            'border-green-500 bg-green-50 dark:bg-green-900/20'
          )}
        >
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            className="mr-2"
          >
            <Check className="h-4 w-4 text-green-700 dark:text-green-300" />
          </motion.span>
          <span className="text-green-700 dark:text-green-300">{getDisplayText()}</span>
        </div>
      );
    }

    if (isSubmitting) {
      return (
        <div
          className={cn(
            'flex w-full items-center rounded-md border px-3 py-2.5 text-sm',
            'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          )}
        >
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-700 dark:text-blue-300" />
          <span className="text-blue-700 dark:text-blue-300">{getDisplayText()}</span>
        </div>
      );
    }

    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between"
            disabled={disabled}
          >
            <span>{getDisplayText()}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {selectedValues.length > 0 && `(${selectedValues.length})`}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="max-h-60 overflow-auto">
            {Array.from(groupedOptions.entries()).map(([groupName, groupOptions], groupIndex) => (
              <div key={groupName}>
                {groupIndex > 0 && <div className="border-t border-border" />}
                <div className="sticky top-0 bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  {groupName}
                </div>
                {groupOptions.map((option) => {
                  const isSelected = selectedValues.includes(option.value);
                  const colorClass = getLoggerColor(option.group);
                  const isMaxReached = maxCount !== undefined && selectedValues.length >= maxCount;
                  const isOptionDisabled = !isSelected && isMaxReached;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleOptionToggle(option.value)}
                      disabled={isOptionDisabled}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-accent text-accent-foreground'
                          : isOptionDisabled
                            ? 'text-muted-foreground cursor-not-allowed opacity-50'
                            : 'text-foreground hover:bg-accent/50'
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={isOptionDisabled}
                        className="pointer-events-none"
                      />
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
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="border-t border-border p-2 space-y-2">
            {selectedValues.length > 0 && !hasMinSelections && (
              <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
                Select at least {minCount} logger{minCount > 1 ? 's' : ''}
              </p>
            )}
            {maxCount !== undefined && selectedValues.length >= maxCount && (
              <p className="text-xs text-blue-600 dark:text-blue-400 text-center">
                Maximum of {maxCount} selected
              </p>
            )}
            <Button
              onClick={handleSubmit}
              className="w-full"
              size="sm"
              disabled={!hasMinSelections}
            >
              {hasMinSelections
                ? `Confirm Selection (${selectedValues.length})`
                : `Select ${minCount - selectedValues.length} more`}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="my-3 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      {/* Context message (shows detected value info) */}
      {contextMessage && !hasSubmitted && (
        <p className="mb-2 text-sm text-muted-foreground">{contextMessage}</p>
      )}
      <p className="mb-3 text-sm font-medium text-foreground">{prompt}</p>

      {renderFormState()}
    </motion.div>
  );
}

/**
 * Interactive selection prompt component.
 * Renders a dropdown for standard selection, or a date picker for date inputs.
 * Uses Radix UI Portal to avoid clipping issues with parent overflow containers.
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
  contextMessage,
  preSelectedValues,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  preFilledDateRange: _preFilledDateRange,
  requireConfirmation,
  minCount,
  maxCount,
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

  // Use the appropriate dropdown component based on selection type
  if (selectionType === 'multiple') {
    return (
      <MultiSelectDropdown
        prompt={prompt}
        options={options}
        onSelect={onSelect}
        disabled={disabled}
        contextMessage={contextMessage}
        preSelectedValues={preSelectedValues}
        minCount={minCount}
        maxCount={maxCount}
      />
    );
  }

  return (
    <SingleSelectDropdown
      prompt={prompt}
      options={options}
      onSelect={onSelect}
      disabled={disabled}
      contextMessage={contextMessage}
      preSelectedValues={preSelectedValues}
      requireConfirmation={requireConfirmation}
    />
  );
}
