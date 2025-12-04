'use client';

import { useThreadRuntime } from '@assistant-ui/react';
import { useCallback } from 'react';

/**
 * Hook to handle suggestion button clicks.
 * Sends the suggestion action as a new user message to continue the conversation.
 *
 * @returns A callback that sends the action text as a user message
 *
 * @example
 * const handleSuggestionClick = useSuggestionClick();
 * <Button onClick={() => handleSuggestionClick("Check efficiency")}>
 *   Check efficiency
 * </Button>
 */
export function useSuggestionClick() {
  const runtime = useThreadRuntime();

  return useCallback(
    (action: string) => {
      runtime.append({
        role: 'user',
        content: [{ type: 'text', text: action }],
      });
    },
    [runtime],
  );
}
