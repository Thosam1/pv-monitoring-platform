'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  icon?: React.ReactNode;
  color?: 'default' | 'green' | 'yellow' | 'red' | 'blue';
  className?: string;
}

const colorClasses = {
  default: 'bg-muted/50 border-border',
  green: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
  yellow: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800',
  red: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
  blue: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
};

const trendClasses = {
  up: 'text-green-600 dark:text-green-400',
  down: 'text-red-600 dark:text-red-400',
  neutral: 'text-muted-foreground',
};

/**
 * Compact metric display card for tool results.
 */
export function MetricCard({
  label,
  value,
  unit,
  trend,
  trendValue,
  icon,
  color = 'default',
  className,
}: Readonly<MetricCardProps>) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'rounded-lg border p-3',
        colorClasses[color],
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-xl font-semibold text-foreground">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
        </div>
        {icon && (
          <div className="flex-shrink-0 text-muted-foreground">{icon}</div>
        )}
      </div>

      {trend && trendValue && (
        <div className={cn('mt-2 flex items-center gap-1 text-xs', trendClasses[trend])}>
          <TrendIcon className="h-3 w-3" />
          <span>{trendValue}</span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Grid container for multiple metric cards.
 */
export function MetricCardGrid({
  children,
  columns = 2,
  className,
}: Readonly<{
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}>) {
  const gridCols = {
    2: 'grid-cols-2',
    3: 'grid-cols-3',
    4: 'grid-cols-4',
  };

  return (
    <div className={cn('grid gap-2', gridCols[columns], className)}>
      {children}
    </div>
  );
}
