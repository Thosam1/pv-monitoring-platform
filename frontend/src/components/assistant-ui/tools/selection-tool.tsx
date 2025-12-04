'use client';

import { makeAssistantToolUI, useComposerRuntime } from '@assistant-ui/react';
import { SelectionPrompt, type SelectionOption } from '@/components/ai/selection-prompt';
import { Check, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Arguments for the request_user_selection tool
 */
interface SelectionToolArgs {
  prompt: string;
  options: SelectionOption[];
  selectionType?: 'single' | 'multiple';
  inputType?: 'dropdown' | 'date' | 'date-range';
  minDate?: string;
  maxDate?: string;
  flowHint?: {
    expectedNext?: string;
    skipOption?: { label: string; action: string };
  };
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
 * Completed selection display component
 */
function SelectionCompleted({ result }: Readonly<{ result: string }>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg border border-green-500 bg-green-50 p-4 dark:bg-green-900/20"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
        <Check className="h-4 w-4" />
        <span>{result}</span>
      </div>
    </motion.div>
  );
}

/**
 * Loading state component
 */
function SelectionLoading() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Preparing selection...</span>
      </div>
    </motion.div>
  );
}

/**
 * Empty options error component - fallback when no options are available
 */
function EmptyOptionsError() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-3 rounded-lg border border-amber-500 bg-amber-50 p-4 dark:bg-amber-900/20"
    >
      <div className="space-y-2">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
          No loggers available
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          Please upload data from your solar system first using the Upload section in the dashboard.
        </p>
      </div>
    </motion.div>
  );
}

/**
 * Tool UI for the request_user_selection tool.
 * Renders an interactive selection component (dropdown, date picker, etc.)
 * and sends the user's selection back to the AI.
 */
export const SelectionTool = makeAssistantToolUI<SelectionToolArgs, string>({
  toolName: 'request_user_selection',
  render: function SelectionToolUI({ args, result, addResult, status }) {
    // Get composer runtime to send messages to backend after selection
    const composerRuntime = useComposerRuntime();

    // Show completed state if we have a result
    if (result) {
      return <SelectionCompleted result={result} />;
    }

    // Show loading state while tool is running
    if (status.type === 'running') {
      return <SelectionLoading />;
    }

    // Type guard: Validate args structure to prevent React child errors
    // This can happen when tool args are malformed or when the LLM outputs
    // the args object as text instead of proper tool call structure
    if (!args || typeof args !== 'object') {
      console.warn('[SelectionTool] Invalid args:', args);
      return <SelectionLoading />;
    }

    // Validate required fields
    const {
      prompt,
      options,
      selectionType,
      inputType,
      minDate,
      maxDate,
      contextMessage,
      preSelectedValues,
      preFilledDateRange,
      requireConfirmation,
    } = args;

    // Extract minCount/maxCount separately to avoid TS6133 false positive
    const minCount = args.minCount;
    const maxCount = args.maxCount;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      console.warn('[SelectionTool] Invalid prompt:', prompt);
      return <SelectionLoading />;
    }

    // Options can be empty for date/date-range input types
    if (inputType !== 'date' && inputType !== 'date-range') {
      if (!Array.isArray(options) || options.length === 0) {
        console.warn('[SelectionTool] Empty options - no loggers available');
        return <EmptyOptionsError />;
      }
    }

    // Handle user selection - record result and send to backend
    const handleSelect = (values: string[]) => {
      const valueText =
        values.length === 1 ? values[0] : values.join(', ');

      // 1. Record the result (marks tool as complete in assistant-ui)
      // Show clean value for user-facing display
      addResult(valueText);

      // 2. Send as user message to trigger backend continuation
      // Add "User selected:" prefix to help the router understand context
      const contextText = `User selected: ${valueText}`;
      composerRuntime.setText(contextText);
      composerRuntime.send();
    };

    // Render the selection prompt with pre-fill support
    return (
      <SelectionPrompt
        prompt={prompt}
        options={options || []}
        selectionType={selectionType || 'single'}
        inputType={inputType || 'dropdown'}
        minDate={minDate}
        maxDate={maxDate}
        onSelect={handleSelect}
        disabled={false}
        contextMessage={contextMessage}
        preSelectedValues={preSelectedValues}
        preFilledDateRange={preFilledDateRange}
        requireConfirmation={requireConfirmation}
        minCount={minCount}
        maxCount={maxCount}
      />
    );
  },
});
