'use client';

import { MyRuntimeProvider } from '@/providers/assistant-runtime-provider';
import { Thread, ThreadList } from '@/components/assistant-ui';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useAssistantRuntime } from '@assistant-ui/react';

export interface AIChatViewProps {
  className?: string;
}

/**
 * Error fallback component for thread errors.
 * Displays a recovery UI when the thread fails to render.
 */
function ThreadErrorFallback({ error, resetErrorBoundary }: Readonly<FallbackProps>) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Something went wrong</h3>
        <p className="text-sm text-muted-foreground">
          Unable to load this conversation. It may have been deleted.
        </p>
      </div>
      <Button onClick={resetErrorBoundary} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" />
        Start New Conversation
      </Button>
      {import.meta.env.DEV && (
        <pre className="mt-4 max-w-md overflow-auto rounded bg-muted p-2 text-left text-xs">
          {error.message}
        </pre>
      )}
    </div>
  );
}

/**
 * Inner component that has access to the runtime context.
 * Separated so we can use useAssistantRuntime hook.
 */
function AIChatViewInner({ className }: Readonly<{ className?: string }>) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const runtime = useAssistantRuntime();

  const handleErrorReset = () => {
    // Switch to a new thread when recovering from an error
    try {
      runtime.switchToNewThread();
    } catch {
      // If switching fails, just let the error boundary reset
      console.warn('[AIChatView] Failed to switch to new thread on error recovery');
    }
  };

  return (
    <div className={cn('flex h-full', className)}>
      {/* Thread List Sidebar - Hidden on mobile and tablet */}
      <div
        className={cn(
          'hidden lg:block transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
        )}
      >
        <ErrorBoundary
          FallbackComponent={ThreadErrorFallback}
          onReset={handleErrorReset}
          onError={(error) => console.error('[ThreadList] Render error:', error)}
        >
          <ThreadList className="h-full" />
        </ErrorBoundary>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Sidebar Toggle - Hidden on mobile and tablet since sidebar is not shown */}
        <div className="flex items-center p-2">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:block cursor-pointer"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
        </div>

        {/* Thread Chat Interface */}
        <ErrorBoundary
          FallbackComponent={ThreadErrorFallback}
          onReset={handleErrorReset}
          onError={(error) => console.error('[Thread] Render error:', error)}
        >
          <Thread className="flex-1" />
        </ErrorBoundary>
      </div>
    </div>
  );
}

/**
 * AI Chat page layout with history sidebar and main chat area.
 * Uses assistant-ui primitives for the chat interface.
 * Wrapped in error boundaries to prevent blank screens on errors.
 */
export function AIChatView({ className }: Readonly<AIChatViewProps>) {
  return (
    <MyRuntimeProvider>
      <AIChatViewInner className={className} />
    </MyRuntimeProvider>
  );
}
