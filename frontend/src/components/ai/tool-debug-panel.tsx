'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Loader2, AlertCircle, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/ai/code-block';

interface ToolPart {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

export interface ToolDebugPanelProps {
  tools: ToolPart[];
  defaultExpanded?: boolean;
  className?: string;
}

/**
 * Collapsible panel showing all tool calls in a message.
 * Provides transparency into what the AI is doing behind the scenes.
 */
export function ToolDebugPanel({
  tools,
  defaultExpanded = false,
  className,
}: ToolDebugPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (tools.length === 0) return null;

  // Count tools by state
  const completedCount = tools.filter((t) => t.state === 'result').length;
  const pendingCount = tools.filter((t) => t.state === 'call' || t.state === 'partial-call').length;
  const hasErrors = tools.some((t) => {
    if (t.state !== 'result') return false;
    const result = t.result as { success?: boolean; error?: string } | undefined;
    return result?.success === false || result?.error;
  });

  return (
    <div className={cn('mt-3 rounded-lg border border-border bg-muted/30', className)}>
      {/* Header - always visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            Tools ({tools.length})
          </span>

          {/* Status badges */}
          <div className="flex items-center gap-1.5">
            {completedCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <Check className="h-3 w-3" />
                {completedCount}
              </span>
            )}
            {pendingCount > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                {pendingCount}
              </span>
            )}
            {hasErrors && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform duration-200',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-border p-3">
              {tools.map((tool) => (
                <ToolDebugItem key={tool.toolCallId} tool={tool} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ToolDebugItemProps {
  tool: ToolPart;
}

/**
 * Individual tool call display with expandable input/output.
 */
function ToolDebugItem({ tool }: ToolDebugItemProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isError = (() => {
    if (tool.state !== 'result') return false;
    const result = tool.result as { success?: boolean; error?: string } | undefined;
    return result?.success === false || result?.error;
  })();

  const StateIcon = (() => {
    switch (tool.state) {
      case 'partial-call':
      case 'call':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case 'result':
        return isError ? (
          <AlertCircle className="h-3.5 w-3.5 text-red-500" />
        ) : (
          <Check className="h-3.5 w-3.5 text-green-500" />
        );
      default:
        return null;
    }
  })();

  return (
    <div
      className={cn(
        'rounded-md border transition-colors',
        isError
          ? 'border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-900/20'
          : 'border-border bg-background'
      )}
    >
      {/* Tool header */}
      <button
        type="button"
        onClick={() => setShowDetails(!showDetails)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          {StateIcon}
          <span className="text-sm font-medium">{formatToolName(tool.toolName)}</span>
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-muted-foreground transition-transform',
            showDetails && 'rotate-180'
          )}
        />
      </button>

      {/* Tool details */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 border-t border-border px-3 py-2">
              {/* Input */}
              <div>
                <span className="text-xs font-medium text-muted-foreground">Input</span>
                <div className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2">
                  <CodeBlock
                    code={JSON.stringify(tool.args, null, 2)}
                    language="json"
                  />
                </div>
              </div>

              {/* Output - only for completed tools */}
              {tool.state === 'result' && tool.result !== undefined && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground">Output</span>
                  <div className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2">
                    <CodeBlock
                      code={JSON.stringify(tool.result, null, 2)}
                      language="json"
                    />
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Formats tool names for display (snake_case → Title Case).
 */
function formatToolName(name: string): string {
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
