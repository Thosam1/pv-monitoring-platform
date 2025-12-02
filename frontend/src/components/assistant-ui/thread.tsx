'use client';

import {
  ThreadPrimitive,
  ComposerPrimitive,
  useThreadRuntime,
} from '@assistant-ui/react';
import { Button } from '@/components/ui/button';
import { WorkflowCard } from '@/components/ai/workflow-card';
import { UserMessage } from './user-message';
import { AssistantMessage } from './assistant-message';
import { SelectionTool, RenderUITool } from './tools';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun,
  Activity,
  DollarSign,
  AlertTriangle,
  Send,
  Square,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Workflow chips for the empty state.
 * Each workflow represents a common user intent.
 */
const WORKFLOWS = [
  {
    id: 'morning-briefing',
    icon: Sun,
    title: 'Morning Briefing',
    description: 'Fleet status & production',
    prompt: 'Good morning! Give me a quick overview of my solar fleet status.',
  },
  {
    id: 'financial-report',
    icon: DollarSign,
    title: 'Financial Report',
    description: 'Savings & ROI analysis',
    prompt: 'Show me the financial savings from my solar production.',
  },
  {
    id: 'performance-check',
    icon: Activity,
    title: 'Performance Check',
    description: 'Efficiency analysis',
    prompt: 'Analyze the performance ratio of my solar installations.',
  },
  {
    id: 'health-diagnostic',
    icon: AlertTriangle,
    title: 'Health Diagnostic',
    description: 'Anomaly detection',
    prompt: 'Check for any health issues or anomalies in my solar systems.',
  },
] as const;

/**
 * Empty state component shown when there are no messages.
 */
function ThreadEmpty() {
  const runtime = useThreadRuntime();

  const handleWorkflowClick = (prompt: string) => {
    runtime.append({ role: 'user', content: [{ type: 'text', text: prompt }] });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center px-4 py-8"
    >
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Sun className="h-6 w-6 text-primary" />
      </div>
      <h2 className="mb-1 text-xl font-semibold">Solar Analyst</h2>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        Your AI-powered solar monitoring assistant
      </p>

      <div className="grid w-full max-w-md grid-cols-2 gap-3">
        {WORKFLOWS.map((workflow) => (
          <WorkflowCard
            key={workflow.id}
            icon={workflow.icon}
            title={workflow.title}
            description={workflow.description}
            onClick={() => handleWorkflowClick(workflow.prompt)}
          />
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Composer component for sending messages.
 */
function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
      <ComposerPrimitive.Input
        placeholder="Ask about your solar installations..."
        className="min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
        autoFocus
      />
      <ThreadPrimitive.If running>
        <ComposerPrimitive.Cancel asChild>
          <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0">
            <Square className="h-4 w-4" />
            <span className="sr-only">Stop</span>
          </Button>
        </ComposerPrimitive.Cancel>
      </ThreadPrimitive.If>
      <ThreadPrimitive.If running={false}>
        <ComposerPrimitive.Send asChild>
          <Button
            size="icon"
            className="h-9 w-9 shrink-0 transition-opacity disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
            <span className="sr-only">Send</span>
          </Button>
        </ComposerPrimitive.Send>
      </ThreadPrimitive.If>
    </ComposerPrimitive.Root>
  );
}

/**
 * Scroll to bottom button for long conversations.
 */
function ScrollToBottomButton() {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <Button
        variant="outline"
        size="icon"
        className="absolute bottom-24 right-4 h-8 w-8 rounded-full shadow-md"
      >
        <ArrowDown className="h-4 w-4" />
        <span className="sr-only">Scroll to bottom</span>
      </Button>
    </ThreadPrimitive.ScrollToBottom>
  );
}

export interface ThreadProps {
  className?: string;
}

/**
 * Main thread component for the AI chat.
 * Renders messages, empty state, and composer.
 */
export function Thread({ className }: ThreadProps) {
  return (
    <ThreadPrimitive.Root
      className={cn('flex h-full flex-col', className)}
    >
      {/* Tool UIs - these are rendered inline with messages */}
      <SelectionTool />
      <RenderUITool />

      <ThreadPrimitive.Viewport className="relative flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4">
          <AnimatePresence mode="wait">
            <ThreadPrimitive.Empty>
              <ThreadEmpty />
            </ThreadPrimitive.Empty>
          </AnimatePresence>

          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </div>

        <ScrollToBottomButton />
      </ThreadPrimitive.Viewport>

      <div className="bg-background p-4">
        <div className="mx-auto w-full max-w-3xl">
          <Composer />
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}
