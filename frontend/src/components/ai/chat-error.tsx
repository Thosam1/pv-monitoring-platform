'use client';

import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Wifi, Clock, ServerCrash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ErrorType = 'network' | 'timeout' | 'api' | 'unknown';

export interface ChatErrorProps {
  type?: ErrorType;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const ERROR_CONFIG: Record<ErrorType, { icon: typeof AlertTriangle; title: string; defaultMessage: string; color: string }> = {
  network: {
    icon: Wifi,
    title: 'Connection Error',
    defaultMessage: 'Unable to connect to the AI service. Please check your internet connection.',
    color: 'text-orange-500',
  },
  timeout: {
    icon: Clock,
    title: 'Request Timed Out',
    defaultMessage: 'The request took too long to complete. Please try again.',
    color: 'text-amber-500',
  },
  api: {
    icon: ServerCrash,
    title: 'Service Error',
    defaultMessage: 'The AI service encountered an error. Please try again later.',
    color: 'text-red-500',
  },
  unknown: {
    icon: AlertTriangle,
    title: 'Something Went Wrong',
    defaultMessage: 'An unexpected error occurred. Please try again.',
    color: 'text-red-500',
  },
};

/**
 * Error display component with retry functionality.
 * Shows different error states with appropriate icons and messages.
 */
export function ChatError({
  type = 'unknown',
  message,
  onRetry,
  className,
}: ChatErrorProps) {
  const config = ERROR_CONFIG[type];
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20',
        className
      )}
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
        className={cn(
          'mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-800',
          config.color
        )}
      >
        <Icon className="h-6 w-6" />
      </motion.div>

      {/* Title */}
      <h3 className="mb-2 text-lg font-semibold text-foreground">{config.title}</h3>

      {/* Message */}
      <p className="mb-4 max-w-sm text-center text-sm text-muted-foreground">
        {message || config.defaultMessage}
      </p>

      {/* Retry button */}
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
      )}
    </motion.div>
  );
}

/**
 * Inline error message for less severe errors.
 */
export function InlineError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400',
        className
      )}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex-shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/40"
        >
          Retry
        </button>
      )}
    </motion.div>
  );
}
