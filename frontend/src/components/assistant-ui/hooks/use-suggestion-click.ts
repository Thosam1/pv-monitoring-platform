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
  // Note: useThreadRuntime is deprecated in favor of useAssistantApi() in v0.12+
  // Current version (v0.11.47) does not have the new API yet
  // Migration: const api = useAssistantApi(); api.thread().append(...)
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
