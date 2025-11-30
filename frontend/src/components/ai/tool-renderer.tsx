'use client';

import { DynamicChart, type DynamicChartProps } from '@/components/dashboard/dynamic-chart';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from '@/components/ui/ai';
import { Loader } from '@/components/ui/ai/loader';
import { CodeBlock } from '@/components/ui/ai/code-block';

// Tool invocation type from AI SDK
interface ToolInvocationState {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

export interface ToolRendererProps {
  toolInvocation: ToolInvocationState;
}

/**
 * Maps tool invocation state to display state.
 */
function getToolState(toolInvocation: ToolInvocationState): 'partial-call' | 'call' | 'result' | 'error' {
  if (toolInvocation.state === 'partial-call') return 'partial-call';
  if (toolInvocation.state === 'call') return 'call';
  if (toolInvocation.state === 'result') return 'result';
  return 'call';
}

/**
 * Renders tool invocations with special handling for render_ui_component.
 * For DynamicChart, renders the chart inline. For other tools, shows JSON results.
 */
export function ToolRenderer({ toolInvocation }: ToolRendererProps) {
  const { toolName, args, state } = toolInvocation;
  const toolState = getToolState(toolInvocation);

  // Special handling for render_ui_component tool
  if (toolName === 'render_ui_component' && state === 'result') {
    const result = toolInvocation.result as { component: string; props: Record<string, unknown> } | undefined;

    if (result?.component === 'DynamicChart') {
      return (
        <div className="my-4 w-full">
          <DynamicChart {...(result.props as unknown as DynamicChartProps)} />
        </div>
      );
    }
  }

  // For other tools or pending states, show collapsible tool UI
  return (
    <Tool defaultOpen={toolState !== 'result'}>
      <ToolHeader toolName={formatToolName(toolName)} state={toolState} />
      <ToolContent>
        <ToolInput input={args} />
        {state === 'call' && (
          <div className="flex items-center gap-2 p-4">
            <Loader size={16} />
            <span className="text-sm text-muted-foreground">Executing...</span>
          </div>
        )}
        {state === 'result' && (
          <ToolOutput
            output={
              <CodeBlock
                code={JSON.stringify(toolInvocation.result, null, 2)}
                language="json"
              />
            }
          />
        )}
      </ToolContent>
    </Tool>
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
