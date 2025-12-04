'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  Lightbulb,
  TrendingUp,
  Settings,
  DollarSign,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
// Re-export types for convenience - use direct export...from syntax
export type { EnhancedPriority, SuggestionIcon, PriorityBadge } from './suggestion-utils';
import type { EnhancedPriority, SuggestionIcon } from './suggestion-utils';

/**
 * Props for the EnhancedSuggestion component.
 */
export interface EnhancedSuggestionProps {
  /** Display label for the suggestion chip */
  label: string;
  /** Natural language action to execute when clicked */
  action: string;
  /** Priority level determining visual style */
  priority: EnhancedPriority;
  /** Contextual explanation for why this is suggested */
  reason?: string;
  /** Icon hint for rendering */
  icon?: SuggestionIcon;
  /** Click handler */
  onClick: (action: string) => void;
}

/**
 * Map icon type to Lucide icon component.
 */
const ICON_MAP: Record<SuggestionIcon, LucideIcon> = {
  alert: AlertTriangle,
  lightbulb: Lightbulb,
  chart: TrendingUp,
  settings: Settings,
  dollar: DollarSign,
};

/**
 * Styling configuration for each priority level.
 */
const PRIORITY_STYLES: Record<
  EnhancedPriority,
  {
    badge: string;
    button: string;
    badgeLabel: string;
  }
> = {
  urgent: {
    badge:
      'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 font-bold',
    button:
      'border-red-300 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/20',
    badgeLabel: '[!]',
  },
  recommended: {
    badge:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 font-semibold',
    button:
      'border-amber-300 hover:bg-amber-50 dark:border-amber-700 dark:hover:bg-amber-900/20',
    badgeLabel: '[*]',
  },
  suggested: {
    badge:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    button:
      'border-blue-300 hover:bg-blue-50 dark:border-blue-700 dark:hover:bg-blue-900/20',
    badgeLabel: '[>]',
  },
  optional: {
    badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    button:
      'border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800',
    badgeLabel: '',
  },
};

/**
 * Enhanced suggestion component with priority badges and contextual reasons.
 *
 * Features:
 * - Priority-colored badges ([!] red, [*] amber, [>] blue)
 * - Icons for suggestion types
 * - Reason text displayed beneath label
 * - Hover animations
 */
export function EnhancedSuggestion({
  label,
  action,
  priority,
  reason,
  icon,
  onClick,
}: Readonly<EnhancedSuggestionProps>) {
  const styles = PRIORITY_STYLES[priority];
  const Icon = icon ? ICON_MAP[icon] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="group"
    >
      <Button
        variant="outline"
        size="sm"
        onClick={() => onClick(action)}
        className={cn(
          'h-auto py-2 px-3 flex flex-col items-start gap-1 text-left max-w-xs',
          styles.button
        )}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {styles.badgeLabel && (
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded shrink-0',
                styles.badge
              )}
            >
              {styles.badgeLabel}
            </span>
          )}
          {Icon && (
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">{label}</span>
        </div>
        {reason && (
          <span className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors pl-0.5 line-clamp-2">
            {reason}
          </span>
        )}
      </Button>
    </motion.div>
  );
}

export default EnhancedSuggestion;
