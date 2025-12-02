'use client';

import { MyRuntimeProvider } from '@/providers/assistant-runtime-provider';
import { Thread, ThreadList } from '@/components/assistant-ui';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface AIChatViewProps {
  className?: string;
}

/**
 * AI Chat page layout with history sidebar and main chat area.
 * Uses assistant-ui primitives for the chat interface.
 */
export function AIChatView({ className }: AIChatViewProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <MyRuntimeProvider>
      <div className={cn('flex h-full', className)}>
        {/* Thread List Sidebar */}
        <div
          className={cn(
            'transition-all duration-300 ease-in-out',
            sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
          )}
        >
          <ThreadList className="h-full" />
        </div>

        {/* Main Chat Area */}
        <div className="flex flex-1 flex-col">
          {/* Sidebar Toggle */}
          <div className="flex items-center border-b border-border p-2">
            <Button
              variant="ghost"
              size="icon"
              className="cursor-pointer"
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
          <Thread className="flex-1" />
        </div>
      </div>
    </MyRuntimeProvider>
  );
}
