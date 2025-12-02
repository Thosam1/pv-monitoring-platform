import { Logger } from '@nestjs/common';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import {
  ExplicitFlowState,
  FlowClassificationSchema,
  FlowType,
  FlowContext,
} from '../types/flow-state';

const logger = new Logger('RouterNode');

/**
 * Classification prompt for LLM-based intent detection.
 */
const CLASSIFICATION_PROMPT = `You are a classification assistant. Analyze the user's message and classify their intent into one of these workflows:

WORKFLOWS:
- morning_briefing: Fleet overview, site status, "how is everything", daily summary, "morning briefing", "status report"
- financial_report: Savings, ROI, money, cost, revenue, financial analysis, "how much did I save", "financial report"
- performance_audit: Compare inverters, efficiency, performance ratio, audit, "compare loggers", "which performs best"
- health_check: Anomalies, errors, health status, diagnostics, problems, "check health", "any issues", "problems"
- free_chat: General questions, specific data queries, single logger power curves, anything that doesn't fit above

RULES:
1. If the user mentions MULTIPLE loggers or wants to COMPARE, classify as performance_audit
2. If the user asks about the whole SITE or FLEET, classify as morning_briefing
3. If the user mentions MONEY, SAVINGS, or COST, classify as financial_report
4. If the user mentions ERRORS, ANOMALIES, or HEALTH, classify as health_check
5. If the user asks for a specific date's data for ONE logger, classify as free_chat
6. When in doubt between flows, prefer free_chat

SELECTION RESPONSE DETECTION:
When the user's message looks like a RESPONSE to a selection prompt (rather than a new question), set isContinuation=true:
- If message is JUST an ID like "925", "9250KHTU22BP0338", or "I selected: 925" → user is responding to logger selection
- If message is JUST a date like "2025-01-15", "January 15", or "I selected: 2025-01-15" → user is responding to date selection
- If message starts with "I selected:" or contains "selected" followed by an ID/date → extract the value
- For selection responses, look at the PREVIOUS assistant message to determine which flow was active

EXTRACTION:
- Extract logger ID if mentioned (e.g., "logger 925", "inverter ABC123", or just "925" if responding to selection)
- Extract logger name/type if mentioned (e.g., "the GoodWe", "meteo station")
- Extract date if mentioned (e.g., "yesterday", "October 15", "2025-01-10")
- If user says "I selected: X" or similar, extract X as the appropriate parameter

RESPONSE FORMAT (JSON only, no markdown):
{
  "flow": "morning_briefing" | "financial_report" | "performance_audit" | "health_check" | "free_chat",
  "confidence": 0.0-1.0,
  "isContinuation": false,
  "extractedParams": {
    "loggerId": "optional string",
    "loggerName": "optional string",
    "date": "optional YYYY-MM-DD string"
  }
}`;

/**
 * Get the last user message from the message history.
 */
function getLastUserMessage(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg instanceof HumanMessage || msg._getType() === 'human') {
      return typeof msg.content === 'string' ? msg.content : '';
    }
  }
  return '';
}

/**
 * Parse the classification response from the LLM.
 */
function parseClassificationResponse(response: string): {
  flow: FlowType;
  confidence: number;
  isContinuation?: boolean;
  extractedParams?: { loggerId?: string; loggerName?: string; date?: string };
} {
  try {
    // Remove markdown code blocks if present
    const cleaned = response.replace(/```json\n?|\n?```/g, '').trim();
    const parsed: unknown = JSON.parse(cleaned);
    const validated = FlowClassificationSchema.parse(parsed);
    return validated;
  } catch (error) {
    logger.warn(`Failed to parse classification response: ${error}`);
    // Default to free_chat on parse failure
    return { flow: 'free_chat', confidence: 0.5 };
  }
}

/**
 * Get the last few messages as context for the router.
 * This helps the router understand if the user is responding to a selection prompt.
 */
function getConversationContext(messages: BaseMessage[]): string {
  const lastMessages = messages.slice(-4); // Get last 4 messages for context
  const context: string[] = [];

  for (const msg of lastMessages) {
    const role = msg._getType() === 'human' ? 'User' : 'Assistant';
    const content =
      typeof msg.content === 'string'
        ? msg.content.substring(0, 200)
        : JSON.stringify(msg.content).substring(0, 200);
    context.push(`${role}: ${content}`);
  }

  return context.join('\n');
}

/**
 * Router node that classifies user intent and routes to appropriate flow.
 *
 * Uses LLM-based classification for flexibility in handling natural language variations.
 * Extracts parameters (logger ID, name, date) during routing to avoid redundant queries.
 */
export async function routerNode(
  state: ExplicitFlowState,
  model: ChatGoogleGenerativeAI | ChatAnthropic | ChatOpenAI | ChatOllama,
): Promise<Partial<ExplicitFlowState>> {
  const userMessage = getLastUserMessage(state.messages);

  if (!userMessage) {
    logger.warn('No user message found, defaulting to free_chat');
    return {
      activeFlow: 'free_chat',
      flowStep: 0,
      flowContext: {},
    };
  }

  logger.debug(`Classifying intent for: "${userMessage.substring(0, 100)}..."`);

  // Get conversation context to help detect selection responses
  const conversationContext = getConversationContext(state.messages);

  try {
    // Use the model for classification with conversation context
    const response = await model.invoke([
      new SystemMessage(CLASSIFICATION_PROMPT),
      new HumanMessage(
        `Recent conversation:\n${conversationContext}\n\nClassify the LAST user message.`,
      ),
    ]);

    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    const classification = parseClassificationResponse(content);

    logger.log(
      `Classified as: ${classification.flow} (confidence: ${classification.confidence}, continuation: ${classification.isContinuation || false})`,
    );

    // Build flow context from extracted parameters
    const flowContext: FlowContext = {};
    if (classification.extractedParams) {
      if (classification.extractedParams.loggerId) {
        flowContext.selectedLoggerId = classification.extractedParams.loggerId;
      }
      if (classification.extractedParams.loggerName) {
        flowContext.extractedLoggerName =
          classification.extractedParams.loggerName;
      }
      if (classification.extractedParams.date) {
        flowContext.selectedDate = classification.extractedParams.date;
      }
    }

    return {
      activeFlow: classification.flow,
      flowStep: 0,
      flowContext,
      // Reset recovery attempts for new flow
      recoveryAttempts: 0,
    };
  } catch (error) {
    logger.error(`Classification failed: ${error}`);
    // Default to free_chat on error
    return {
      activeFlow: 'free_chat',
      flowStep: 0,
      flowContext: {},
    };
  }
}

/**
 * Routing function for conditional edges after router node.
 * Returns the flow name to route to.
 */
export function routeToFlow(
  state: ExplicitFlowState,
):
  | 'morning_briefing'
  | 'financial_report'
  | 'performance_audit'
  | 'health_check'
  | 'free_chat' {
  const flow = state.activeFlow || 'free_chat';
  logger.debug(`Routing to flow: ${flow}`);
  return flow;
}
