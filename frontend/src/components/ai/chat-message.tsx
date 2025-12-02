'use client';

import { useMemo } from 'react';
import {
  Message,
  MessageContent,
  Response,
  Suggestion,
} from '@/components/ui/ai';
import { ToolRenderer } from './tool-renderer';
import { TypingIndicator } from './typing-indicator';
import { sanitizeLLMOutput } from '@/lib/text-sanitizer';
import type { UIMessage } from 'ai';

export interface ChatMessageProps {
  message: UIMessage;
  isLoading?: boolean;
  isLastMessage?: boolean;
  onUserSelection?: (toolCallId: string, values: string[]) => void;
  onFollowUpClick?: (suggestion: string) => void;
}

// Tools that should be rendered inline (UI components, selections)
const VISIBLE_TOOLS = new Set([
  'render_ui_component',
  'request_user_selection',
]);

// Tools that should be completely hidden (data fetching, internal operations)
// These are "plumbing" - users don't need to see them
const HIDDEN_TOOLS = new Set([
  'list_loggers',
  'get_power_curve',
  'analyze_inverter_health',
  'compare_loggers',
  'calculate_financial_savings',
  'calculate_performance_ratio',
  'forecast_production',
  'diagnose_error_codes',
  'get_fleet_overview',
]);

// Follow-up suggestions based on tools used
interface FollowUpRule {
  condition?: (result: unknown) => boolean;
  suggestions: string[];
}

const FOLLOWUP_RULES: Record<string, FollowUpRule> = {
  'list_loggers': {
    suggestions: [
      'Compare the top 2 performers',
      'Check health of all devices',
    ],
  },
  'analyze_inverter_health': {
    condition: (result) => {
      const r = result as { result?: { anomalyCount?: number } };
      return (r?.result?.anomalyCount ?? 0) > 0;
    },
    suggestions: [
      'Diagnose error codes',
      'Show power curve for affected days',
    ],
  },
  'get_power_curve': {
    suggestions: [
      'Calculate efficiency ratio',
      'Show 7-day forecast',
    ],
  },
  'get_fleet_overview': {
    condition: (result) => {
      const r = result as { result?: { status?: { percentOnline?: number } } };
      return (r?.result?.status?.percentOnline ?? 100) < 100;
    },
    suggestions: [
      'Diagnose offline devices',
      'Show health report',
    ],
  },
  'calculate_financial_savings': {
    suggestions: [
      'Forecast next month',
      'Compare to last period',
    ],
  },
  'calculate_performance_ratio': {
    suggestions: [
      'Compare all inverters',
      'Show power curve',
    ],
  },
};

/**
 * Renders a single chat message with role-specific styling.
 * Handles text content, tool invocations, and loading states.
 */
export function ChatMessage({ message, isLoading, isLastMessage, onUserSelection, onFollowUpClick }: ChatMessageProps) {
  const { role, parts } = message;
  const isUser = role === 'user';

  // Filter out empty text parts
  const textParts = parts.filter(
    (part) => part.type === 'text' && part.text && part.text.trim().length > 0
  );

  // Separate tool parts into visible (rendered inline) and debug (collapsible panel)
  const allToolParts = parts.filter((part) => part.type.startsWith('tool-'));

  const visibleToolParts = allToolParts.filter((part) => {
    const toolPart = part as { toolName?: string };
    return toolPart.toolName && VISIBLE_TOOLS.has(toolPart.toolName);
  });

  // Determine loading state based on VISIBLE content only
  // Hidden tools shouldn't suppress the typing indicator
  const hasVisibleContent = textParts.length > 0 || visibleToolParts.length > 0;
  const showTypingIndicator = isLoading && !isUser && !hasVisibleContent;

  // Determine if hidden tools are currently executing (for "Analyzing..." state)
  const hasExecutingHiddenTools = allToolParts.some((part) => {
    const toolPart = part as { state?: string; toolName?: string };
    const isHidden = toolPart.toolName && HIDDEN_TOOLS.has(toolPart.toolName);
    const isExecuting = toolPart.state === 'call' || toolPart.state === 'partial-call';
    return isHidden && isExecuting;
  });

  // Generate follow-up suggestions based on tools used (only for last message)
  const followUpSuggestions = useMemo(() => {
    if (isLoading || isUser || !isLastMessage) return [];

    // Detect completed tool calls (state === 'result') directly from parts
    const completedTools = parts
      .filter((part) => part.type.startsWith('tool-'))
      .filter((part) => {
        const toolPart = part as { state?: string; toolName?: string; result?: unknown };
        return toolPart.state === 'result' && toolPart.toolName;
      })
      .map((part) => {
        const toolPart = part as { toolName: string; result?: unknown };
        return {
          toolName: toolPart.toolName,
          result: toolPart.result,
        };
      });

    const suggestions: string[] = [];
    for (const tool of completedTools) {
      const rule = FOLLOWUP_RULES[tool.toolName];
      if (rule) {
        const shouldShow = !rule.condition || rule.condition(tool.result);
        if (shouldShow) {
          suggestions.push(...rule.suggestions);
        }
      }
    }
    // Deduplicate and limit to 3 suggestions
    return [...new Set(suggestions)].slice(0, 3);
  }, [parts, isLoading, isUser, isLastMessage]);

  return (
    <Message from={role}>
      {/* Message Content */}
      <MessageContent className={isUser ? '' : 'max-w-none w-full'}>
        {/* Text content - filtered to exclude empty text */}
        {textParts.map((part, index) => {
          const rawText = (part as { text?: string }).text || '';
          // Sanitize assistant messages to remove LLM tokens
          const textContent = isUser ? rawText : sanitizeLLMOutput(rawText);

          // Skip rendering if sanitization removed all content
          if (!textContent.trim()) {
            return null;
          }

          return (
            <Response key={`text-${index}`}>
              {textContent}
            </Response>
          );
        })}

        {/* Visible tool invocations (UI components, selections) */}
        {visibleToolParts.map((part) => {
          const toolPart = part as {
            type: string;
            toolCallId: string;
            toolName: string;
            args: Record<string, unknown>;
            state?: 'partial-call' | 'call' | 'result';
            result?: unknown;
          };

          // Determine state based on whether result exists (for assistant-ui compatibility)
          // assistant-ui uses 'result' field presence, not 'state' field
          const effectiveState: 'partial-call' | 'call' | 'result' =
            toolPart.state || (toolPart.result !== undefined ? 'result' : 'call');

          return (
            <ToolRenderer
              key={`tool-${toolPart.toolCallId}`}
              toolInvocation={{
                toolCallId: toolPart.toolCallId,
                toolName: toolPart.toolName,
                args: toolPart.args,
                state: effectiveState,
                result: toolPart.result,
              }}
              onUserSelection={onUserSelection}
            />
          );
        })}

        {/* Typing indicator - shows when loading and no visible content yet */}
        {showTypingIndicator && (
          <TypingIndicator />
        )}

        {/* Analyzing indicator - shows when hidden tools are executing */}
        {isLoading && hasExecutingHiddenTools && !showTypingIndicator && (
          <TypingIndicator
            message="Analyzing..."
            variant="tools"
          />
        )}

        {/* Follow-up suggestion chips - only on last assistant message when not loading */}
        {!isLoading && isLastMessage && followUpSuggestions.length > 0 && onFollowUpClick && (
          <div className="mt-4 flex flex-wrap gap-2">
            {followUpSuggestions.map((suggestion) => (
              <Suggestion
                key={suggestion}
                suggestion={suggestion}
                onClick={onFollowUpClick}
                variant="outline"
                size="sm"
              />
            ))}
          </div>
        )}
      </MessageContent>
    </Message>
  );
}
