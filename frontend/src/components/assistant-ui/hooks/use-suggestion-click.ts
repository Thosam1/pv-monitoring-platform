'use client';

/**
 * NOTE: useThreadRuntime is marked as deprecated in @assistant-ui/react v0.11.x.
 * The library authors marked these as deprecated to prepare users for v0.12.0,
 * but the migration is not possible yet because the replacement APIs
 * (useAssistantApi, useAssistantState) are not available until v0.12.0.
 * We are waiting for the v0.12.0 release to migrate.
 * @see https://github.com/assistant-ui/assistant-ui/releases
 */
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
  const runtime = useThreadRuntime(); // NOSONAR - useThreadRuntime deprecated but replacement (useAssistantApi) not available until v0.12.0

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
