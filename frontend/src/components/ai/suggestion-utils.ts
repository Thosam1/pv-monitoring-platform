/**
 * Utility functions for suggestion components.
 * Separated from the component file to satisfy react-refresh/only-export-components.
 */

/**
 * Priority levels for enhanced suggestions.
 */
export type EnhancedPriority =
  | 'urgent'
  | 'recommended'
  | 'suggested'
  | 'optional';

/**
 * Icon types for enhanced suggestions.
 */
export type SuggestionIcon =
  | 'alert'
  | 'lightbulb'
  | 'chart'
  | 'settings'
  | 'dollar';

/**
 * Badge characters for visual priority indicators.
 */
export type PriorityBadge = '!' | '*' | '>' | null;

/**
 * Priority order for sorting suggestions.
 */
const PRIORITY_ORDER: Record<EnhancedPriority, number> = {
  urgent: 0,
  recommended: 1,
  suggested: 2,
  optional: 3,
};

/**
 * Sort suggestions by priority (urgent first).
 */
export function sortSuggestionsByPriority<
  T extends { priority: EnhancedPriority }
>(suggestions: T[]): T[] {
  return [...suggestions].sort(
    (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
  );
}

/**
 * Normalize legacy priority ('primary'/'secondary') to enhanced priority.
 */
export function normalizeToEnhancedPriority(
  priority: string
): EnhancedPriority {
  if (priority === 'primary') return 'recommended';
  if (priority === 'secondary') return 'suggested';
  if (['urgent', 'recommended', 'suggested', 'optional'].includes(priority)) {
    return priority as EnhancedPriority;
  }
  return 'suggested';
}

/**
 * Map priority to badge character.
 */
export function priorityToBadge(priority: EnhancedPriority): PriorityBadge {
  const badgeMap: Record<EnhancedPriority, PriorityBadge> = {
    urgent: '!',
    recommended: '*',
    suggested: '>',
    optional: null,
  };
  return badgeMap[priority];
}
