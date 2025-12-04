'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Sparkles, Wrench } from 'lucide-react';

export interface TypingIndicatorProps {
  message?: string;
  variant?: 'default' | 'tools';
  className?: string;
}

/**
 * Animated typing indicator with bouncing dots.
 * Shows different states for thinking vs tool execution.
 */
export function TypingIndicator({
  message = 'Thinking...',
  variant = 'default',
  className,
}: Readonly<TypingIndicatorProps>) {
  const Icon = variant === 'tools' ? Wrench : Sparkles;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex items-center gap-3 py-2',
        className
      )}
    >
      {/* Icon with pulse animation */}
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full',
          variant === 'tools'
            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
            : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </motion.div>

      {/* Message and animated dots */}
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-muted-foreground">{message}</span>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{
                y: [0, -4, 0],
                opacity: [0.4, 1, 0.4],
              }}
              transition={{
                duration: 0.6,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                variant === 'tools'
                  ? 'bg-blue-500 dark:bg-blue-400'
                  : 'bg-amber-500 dark:bg-amber-400'
              )}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
