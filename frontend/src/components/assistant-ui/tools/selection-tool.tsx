'use client';

import { makeAssistantToolUI } from '@assistant-ui/react';
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
}

/**
 * Completed selection display component
 */
function SelectionCompleted({ result }: { result: string }) {
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
 * Tool UI for the request_user_selection tool.
 * Renders an interactive selection component (dropdown, date picker, etc.)
 * and sends the user's selection back to the AI.
 */
export const SelectionTool = makeAssistantToolUI<SelectionToolArgs, string>({
  toolName: 'request_user_selection',
  render: function SelectionToolUI({ args, result, addResult, status }) {
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
    const { prompt, options, selectionType, inputType, minDate, maxDate } = args;

    if (typeof prompt !== 'string' || !prompt.trim()) {
      console.warn('[SelectionTool] Invalid prompt:', prompt);
      return <SelectionLoading />;
    }

    if (!Array.isArray(options) || options.length === 0) {
      console.warn('[SelectionTool] Invalid options:', options);
      return <SelectionLoading />;
    }

    // Handle user selection
    const handleSelect = (values: string[]) => {
      const selectionText =
        values.length === 1
          ? `I selected: ${values[0]}`
          : `I selected: ${values.join(', ')}`;
      addResult(selectionText);
    };

    // Render the selection prompt
    return (
      <SelectionPrompt
        prompt={prompt}
        options={options}
        selectionType={selectionType || 'single'}
        inputType={inputType || 'dropdown'}
        minDate={minDate}
        maxDate={maxDate}
        onSelect={handleSelect}
        disabled={false}
      />
    );
  },
});
