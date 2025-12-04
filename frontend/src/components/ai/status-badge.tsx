'use client';

import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, XCircle, Info, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StatusType = 'healthy' | 'normal' | 'warning' | 'low' | 'critical' | 'error' | 'info' | 'active';

export interface StatusBadgeProps {
  status: StatusType;
  label?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const statusConfig: Record<StatusType, { icon: typeof CheckCircle; color: string; bgColor: string; label: string }> = {
  healthy: {
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Healthy',
  },
  normal: {
    icon: CheckCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Normal',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Warning',
  },
  low: {
    icon: AlertTriangle,
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    label: 'Low',
  },
  critical: {
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Critical',
  },
  error: {
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100 dark:bg-red-900/30',
    label: 'Error',
  },
  info: {
    icon: Info,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    label: 'Info',
  },
  active: {
    icon: Activity,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    label: 'Active',
  },
};

const sizeClasses = {
  sm: 'text-xs px-1.5 py-0.5 gap-1',
  md: 'text-sm px-2 py-1 gap-1.5',
  lg: 'text-base px-3 py-1.5 gap-2',
};

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

/**
 * Status badge component for displaying health/status indicators.
 */
export function StatusBadge({
  status,
  label,
  showIcon = true,
  size = 'md',
  className,
}: Readonly<StatusBadgeProps>) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.bgColor,
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{label || config.label}</span>
    </motion.span>
  );
}

/**
 * Inline status indicator (just the dot + text).
 */
export function StatusIndicator({
  status,
  label,
  className,
}: Readonly<{
  status: StatusType;
  label?: string;
  className?: string;
}>) {
  const config = statusConfig[status];

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className={cn(
        'h-2 w-2 rounded-full',
        status === 'healthy' || status === 'normal' || status === 'active' ? 'bg-green-500' :
        status === 'warning' || status === 'low' ? 'bg-amber-500' :
        'bg-red-500'
      )} />
      <span className="text-muted-foreground">{label || config.label}</span>
    </span>
  );
}
