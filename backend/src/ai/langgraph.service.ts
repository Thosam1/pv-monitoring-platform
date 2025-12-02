import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StateGraph,
  START,
  END,
  CompiledStateGraph,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';
import { ChatOllama } from '@langchain/ollama';
import { ToolsHttpClient } from './tools-http.client';
import { getAllTools } from './langchain-tools';
import {
  ExplicitFlowStateAnnotation,
  ExplicitFlowState,
  PendingUiAction,
} from './types/flow-state';
import { routerNode, routeToFlow } from './nodes/router.node';
import { createMorningBriefingFlow } from './flows/morning-briefing.flow';
import { createFinancialReportFlow } from './flows/financial-report.flow';
import { createPerformanceAuditFlow } from './flows/performance-audit.flow';
import { createHealthCheckFlow } from './flows/health-check.flow';
import { createRecoverySubgraph } from './subgraphs/recovery.subgraph';
import { USER_FRIENDLY_SYSTEM_PROMPT } from './prompts/user-friendly.prompt';

/**
 * System prompt for free-form chat (fallback mode).
 * Uses the user-friendly prompt designed for non-technical PV plant owners.
 */
const SYSTEM_PROMPT = USER_FRIENDLY_SYSTEM_PROMPT;

type AIProvider = 'gemini' | 'anthropic' | 'openai' | 'ollama';
type ModelType =
  | ChatGoogleGenerativeAI
  | ChatAnthropic
  | ChatOpenAI
  | ChatOllama;

/**
 * LangGraph-based AI Service for handling chat interactions.
 *
 * Features:
 * - Explicit flow-based routing for deterministic workflows
 * - Multi-provider support (Gemini, Anthropic, OpenAI)
 * - Error recovery subgraph for tool failures
 * - Pass-through tools for UI rendering
 * - Streaming support via async generator
 *
 * Flow Architecture:
 * - Router node classifies intent using LLM
 * - 4 explicit workflow subgraphs (Morning Briefing, Financial, Performance, Health)
 * - Free chat fallback for general queries
 * - Global recovery subgraph for data errors
 */
@Injectable()
export class LanggraphService {
  private readonly logger = new Logger(LanggraphService.name);

  private graph: CompiledStateGraph<any, any, any> | null = null;
  private model: ModelType | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly toolsHttpClient: ToolsHttpClient,
  ) {
    this.logger.log(
      `LangGraph Service initialized with provider: ${this.getProvider()}`,
    );
  }

  /**
   * Get the configured AI provider.
   */
  private getProvider(): AIProvider {
    const provider = this.configService.get<string>('AI_PROVIDER', 'gemini');
    if (['gemini', 'anthropic', 'openai', 'ollama'].includes(provider)) {
      return provider as AIProvider;
    }
    this.logger.warn(
      `Invalid AI_PROVIDER "${provider}", falling back to gemini`,
    );
    return 'gemini';
  }

  /**
   * Get the language model based on the configured provider.
   */
  private getModel(): ModelType {
    if (this.model) {
      return this.model;
    }

    const provider = this.getProvider();

    switch (provider) {
      case 'anthropic': {
        const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
        if (!apiKey) {
          throw new Error(
            'ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic',
          );
        }
        const modelName = this.configService.get<string>(
          'ANTHROPIC_MODEL',
          'claude-3-5-sonnet-20241022',
        );
        this.logger.debug(`Using Anthropic model: ${modelName}`);
        this.model = new ChatAnthropic({
          apiKey,
          model: modelName,
        });
        break;
      }

      case 'openai': {
        const apiKey = this.configService.get<string>('OPENAI_API_KEY');
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
        }
        const modelName = this.configService.get<string>(
          'OPENAI_MODEL',
          'gpt-4o',
        );
        this.logger.debug(`Using OpenAI model: ${modelName}`);
        this.model = new ChatOpenAI({
          apiKey,
          model: modelName,
        });
        break;
      }

      case 'ollama': {
        const baseUrl = this.configService.get<string>(
          'OLLAMA_BASE_URL',
          'http://127.0.0.1:11434',
        );
        const modelName = this.configService.get<string>(
          'OLLAMA_MODEL',
          'gpt-oss:20b',
        );
        this.logger.debug(`Using Ollama model: ${modelName} at ${baseUrl}`);
        this.model = new ChatOllama({
          baseUrl,
          model: modelName,
        });
        break;
      }

      case 'gemini':
      default: {
        const apiKey = this.configService.get<string>(
          'GOOGLE_GENERATIVE_AI_API_KEY',
        );
        if (!apiKey) {
          throw new Error(
            'GOOGLE_GENERATIVE_AI_API_KEY is required when AI_PROVIDER=gemini',
          );
        }
        const modelName = this.configService.get<string>(
          'GEMINI_MODEL',
          'gemini-1.5-flash',
        );
        this.logger.debug(`Using Gemini model: ${modelName}`);
        this.model = new ChatGoogleGenerativeAI({
          apiKey,
          model: modelName,
        });
        break;
      }
    }

    return this.model;
  }

  /**
   * Check if explicit flows are enabled via feature flag.
   */
  private isExplicitFlowsEnabled(): boolean {
    return (
      this.configService.get<string>('EXPLICIT_FLOWS_ENABLED', 'true') ===
      'true'
    );
  }

  /**
   * Build the explicit flow graph with router and workflow subgraphs.
   */
  private buildExplicitFlowGraph() {
    const tools = getAllTools(this.toolsHttpClient);
    const model = this.getModel();
    const modelWithTools = model.bindTools(tools);

    // Create workflow subgraphs
    const morningBriefingGraph = createMorningBriefingFlow(
      this.toolsHttpClient,
      model,
    );
    const financialReportGraph = createFinancialReportFlow(
      this.toolsHttpClient,
      model,
    );
    const performanceAuditGraph = createPerformanceAuditFlow(
      this.toolsHttpClient,
      model,
    );
    const healthCheckGraph = createHealthCheckFlow(this.toolsHttpClient, model);
    const recoveryGraph = createRecoverySubgraph(this.toolsHttpClient);

    // Router node wrapper to inject model
    const routerWithModel = async (
      state: ExplicitFlowState,
    ): Promise<Partial<ExplicitFlowState>> => {
      return routerNode(state, model);
    };

    // Free chat LLM node (existing behavior)
    const callModel = async (
      state: ExplicitFlowState,
    ): Promise<Partial<ExplicitFlowState>> => {
      this.logger.debug(
        `Free chat: processing ${state.messages.length} messages`,
      );

      const messages = state.messages;
      const hasSystemMessage = messages.some((m) => m._getType() === 'system');

      const messagesWithSystem = hasSystemMessage
        ? messages
        : [new SystemMessage(SYSTEM_PROMPT), ...messages];

      const response = await modelWithTools.invoke(messagesWithSystem);

      // Check for UI pass-through tools
      const pendingUiActions: PendingUiAction[] = [];

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const toolCall of response.tool_calls) {
          if (
            toolCall.name === 'render_ui_component' ||
            toolCall.name === 'request_user_selection'
          ) {
            pendingUiActions.push({
              toolCallId: toolCall.id || '',
              toolName: toolCall.name,
              args: toolCall.args,
            });
          }
        }
      }

      return {
        messages: [response],
        pendingUiActions,
      };
    };

    // Tool execution node
    const toolNode = new ToolNode(tools);

    // Error recovery check node
    const checkToolResults = (
      state: ExplicitFlowState,
    ): Partial<ExplicitFlowState> => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage._getType() !== 'tool') {
        return {};
      }

      const toolMessage = lastMessage as ToolMessage;
      let content: unknown = toolMessage.content;

      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          return {};
        }
      }

      const result = content as Record<string, unknown>;
      const status = result?.status as string | undefined;

      if (status === 'no_data_in_window' || status === 'no_data') {
        const newAttempts = (state.recoveryAttempts || 0) + 1;

        if (newAttempts > 3) {
          this.logger.warn(
            `Max recovery attempts (3) reached for tool ${toolMessage.name}`,
          );
          return { recoveryAttempts: newAttempts };
        }

        this.logger.debug(
          `Recovery needed: ${status} (attempt ${newAttempts})`,
        );

        return {
          recoveryAttempts: newAttempts,
          flowContext: {
            ...state.flowContext,
            toolResults: {
              ...state.flowContext.toolResults,
              [toolMessage.name || 'unknown']: result,
              needsRecovery: true,
              availableRange: result.availableRange,
            },
          },
        };
      }

      return { recoveryAttempts: 0 };
    };

    // Routing: should continue after LLM?
    const shouldContinue = (state: ExplicitFlowState): 'tools' | 'end' => {
      const lastMessage = state.messages[state.messages.length - 1];

      if (
        lastMessage._getType() === 'ai' &&
        (lastMessage as AIMessage).tool_calls &&
        (lastMessage as AIMessage).tool_calls!.length > 0
      ) {
        this.logger.debug('Routing to tools node');
        return 'tools';
      }

      this.logger.debug('Routing to end');
      return 'end';
    };

    // Routing: should trigger recovery?
    const shouldRecover = (state: ExplicitFlowState): 'recovery' | 'llm' => {
      const needsRecovery = state.flowContext.toolResults?.needsRecovery;
      const attempts = state.recoveryAttempts || 0;

      if (needsRecovery && attempts <= 3) {
        this.logger.debug('Routing to recovery subgraph');
        return 'recovery';
      }

      return 'llm';
    };

    // Build the main graph
    const graph = new StateGraph(ExplicitFlowStateAnnotation)
      // Entry: Router classifies intent
      .addNode('router', routerWithModel)

      // Explicit workflow subgraphs
      .addNode('morning_briefing', async (state) => {
        const result = await morningBriefingGraph.invoke(state);
        return result;
      })
      .addNode('financial_report', async (state) => {
        const result = await financialReportGraph.invoke(state);
        return result;
      })
      .addNode('performance_audit', async (state) => {
        const result = await performanceAuditGraph.invoke(state);
        return result;
      })
      .addNode('health_check', async (state) => {
        const result = await healthCheckGraph.invoke(state);
        return result;
      })

      // Free chat nodes (fallback)
      .addNode('free_chat', callModel)
      .addNode('tools', toolNode)
      .addNode('check_results', checkToolResults)

      // Recovery subgraph
      .addNode('recovery', async (state) => {
        const result = await recoveryGraph.invoke(state);
        return result;
      })

      // Edges: Entry point
      .addEdge(START, 'router')

      // Edges: Router to workflows
      .addConditionalEdges('router', routeToFlow, {
        morning_briefing: 'morning_briefing',
        financial_report: 'financial_report',
        performance_audit: 'performance_audit',
        health_check: 'health_check',
        free_chat: 'free_chat',
      })

      // Edges: Workflow completions
      .addEdge('morning_briefing', END)
      .addEdge('financial_report', END)
      .addEdge('performance_audit', END)
      .addEdge('health_check', END)

      // Edges: Free chat loop
      .addConditionalEdges('free_chat', shouldContinue, {
        tools: 'tools',
        end: END,
      })
      .addEdge('tools', 'check_results')
      .addConditionalEdges('check_results', shouldRecover, {
        recovery: 'recovery',
        llm: 'free_chat',
      })

      // Edges: Recovery completion
      .addEdge('recovery', END)

      .compile();

    this.logger.log('Explicit flow graph compiled successfully');
    return graph;
  }

  /**
   * Build the legacy graph (no explicit flows).
   * This is the original implementation for backward compatibility.
   */
  private buildLegacyGraph() {
    const tools = getAllTools(this.toolsHttpClient);
    const model = this.getModel().bindTools(tools);

    const callModel = async (
      state: ExplicitFlowState,
    ): Promise<Partial<ExplicitFlowState>> => {
      this.logger.debug(
        `LLM node: processing ${state.messages.length} messages`,
      );

      const messages = state.messages;
      const hasSystemMessage = messages.some((m) => m._getType() === 'system');

      const messagesWithSystem = hasSystemMessage
        ? messages
        : [new SystemMessage(SYSTEM_PROMPT), ...messages];

      const response = await model.invoke(messagesWithSystem);

      const pendingUiActions: PendingUiAction[] = [];

      if (response.tool_calls && response.tool_calls.length > 0) {
        for (const toolCall of response.tool_calls) {
          if (
            toolCall.name === 'render_ui_component' ||
            toolCall.name === 'request_user_selection'
          ) {
            pendingUiActions.push({
              toolCallId: toolCall.id || '',
              toolName: toolCall.name,
              args: toolCall.args,
            });
          }
        }
      }

      return {
        messages: [response],
        pendingUiActions,
      };
    };

    const toolNode = new ToolNode(tools);

    const checkToolResults = (
      state: ExplicitFlowState,
    ): Partial<ExplicitFlowState> => {
      const messages = state.messages;
      const lastMessage = messages[messages.length - 1];

      if (lastMessage._getType() !== 'tool') {
        return {};
      }

      const toolMessage = lastMessage as ToolMessage;
      let content: unknown = toolMessage.content;

      if (typeof content === 'string') {
        try {
          content = JSON.parse(content);
        } catch {
          return {};
        }
      }

      const result = content as Record<string, unknown>;
      const status = result?.status as string | undefined;

      if (status === 'no_data_in_window' || status === 'no_data') {
        const newAttempts = (state.recoveryAttempts || 0) + 1;

        if (newAttempts > 3) {
          this.logger.warn(
            `Max recovery attempts (3) reached for tool ${toolMessage.name}`,
          );
          return { recoveryAttempts: newAttempts };
        }

        return { recoveryAttempts: newAttempts };
      }

      return { recoveryAttempts: 0 };
    };

    const shouldContinue = (state: ExplicitFlowState): 'tools' | 'end' => {
      const lastMessage = state.messages[state.messages.length - 1];

      if (
        lastMessage._getType() === 'ai' &&
        (lastMessage as AIMessage).tool_calls &&
        (lastMessage as AIMessage).tool_calls!.length > 0
      ) {
        return 'tools';
      }

      return 'end';
    };

    const graph = new StateGraph(ExplicitFlowStateAnnotation)
      .addNode('llm', callModel)
      .addNode('tools', toolNode)
      .addNode('check_results', checkToolResults)
      .addEdge(START, 'llm')
      .addConditionalEdges('llm', shouldContinue, {
        tools: 'tools',
        end: END,
      })
      .addEdge('tools', 'check_results')
      .addEdge('check_results', 'llm')
      .compile();

    this.logger.log('Legacy graph compiled successfully');
    return graph;
  }

  /**
   * Build the appropriate graph based on feature flag.
   */
  private buildGraph() {
    if (this.isExplicitFlowsEnabled()) {
      return this.buildExplicitFlowGraph();
    }
    return this.buildLegacyGraph();
  }

  /**
   * Get or build the graph (lazy initialization).
   */
  private getGraph() {
    if (!this.graph) {
      this.graph = this.buildGraph();
    }
    return this.graph;
  }

  /**
   * Convert incoming chat messages to LangChain message format.
   */
  private convertMessages(
    messages: Array<{ role: string; content: string }>,
  ): BaseMessage[] {
    return messages
      .filter((m) => m.content && m.content.trim().length > 0)
      .map((m) => {
        switch (m.role) {
          case 'user':
            return new HumanMessage(m.content);
          case 'assistant':
            return new AIMessage(m.content);
          case 'system':
            return new SystemMessage(m.content);
          default:
            return new HumanMessage(m.content);
        }
      });
  }

  /**
   * Stream chat responses using an async generator.
   *
   * Yields events in a format compatible with the frontend SSE handler:
   * - { type: 'text-delta', delta: string }
   * - { type: 'tool-input-available', toolCallId, toolName, input }
   * - { type: 'tool-output-available', toolCallId, output }
   */
  async *streamChat(
    messages: Array<{ role: string; content: string }>,
  ): AsyncGenerator<{
    type: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  }> {
    const graph = this.getGraph();
    const langchainMessages = this.convertMessages(messages);

    this.logger.log(`Streaming chat with ${langchainMessages.length} messages`);

    // Track tool calls we've already reported
    const reportedToolCalls = new Set<string>();
    const reportedToolResults = new Set<string>();

    if (!graph) {
      throw new Error('Failed to build chat graph');
    }

    try {
      // Stream events from the graph
      const stream = graph.streamEvents(
        { messages: langchainMessages },
        { version: 'v2' },
      );

      // Internal nodes that should NOT emit text to the frontend
      // These produce JSON classification or internal state, not user-facing content
      const INTERNAL_NODES = new Set([
        'router', // Produces classification JSON like {"flow":"health_check"...}
        'check_context', // Internal state check
        'check_results', // Internal recovery check
      ]);

      for await (const event of stream) {
        // Handle different event types from LangGraph
        if (event.event === 'on_chat_model_stream') {
          // Filter out internal node output (e.g., router classification JSON)
          const nodeName = (event.metadata as { langgraph_node?: string })
            ?.langgraph_node;
          if (nodeName && INTERNAL_NODES.has(nodeName)) {
            continue; // Skip internal node output
          }

          // Streaming text from the model
          const chunk = event.data?.chunk as
            | { content?: string }
            | null
            | undefined;
          if (chunk?.content && typeof chunk.content === 'string') {
            yield { type: 'text-delta', delta: chunk.content };
          }
        } else if (event.event === 'on_chat_model_end') {
          // Filter out internal node output (e.g., router classification JSON)
          const nodeName = (event.metadata as { langgraph_node?: string })
            ?.langgraph_node;
          if (nodeName && INTERNAL_NODES.has(nodeName)) {
            continue; // Skip internal node output
          }

          // Model finished - check for tool calls
          const output = event.data?.output as
            | {
                tool_calls?: Array<{
                  id?: string;
                  name: string;
                  args: unknown;
                }>;
              }
            | null
            | undefined;
          if (output?.tool_calls && Array.isArray(output.tool_calls)) {
            for (const toolCall of output.tool_calls) {
              const toolCallId = toolCall.id ?? `tool_${Date.now()}`;
              if (!reportedToolCalls.has(toolCallId)) {
                reportedToolCalls.add(toolCallId);
                yield {
                  type: 'tool-input-available',
                  toolCallId,
                  toolName: toolCall.name,
                  input: toolCall.args,
                };

                // For UI pass-through tools, also emit tool-output-available immediately
                // since these don't go through tool execution - the args ARE the result
                if (
                  toolCall.name === 'render_ui_component' ||
                  toolCall.name === 'request_user_selection'
                ) {
                  this.logger.debug(
                    `Emitting immediate tool-output-available for UI pass-through: ${toolCall.name}`,
                  );
                  yield {
                    type: 'tool-output-available',
                    toolCallId,
                    output: toolCall.args,
                  };
                }
              }
            }
          }
        } else if (event.event === 'on_tool_end') {
          // Tool execution finished
          const toolCallId = event.run_id ?? `tool_result_${Date.now()}`;
          if (!reportedToolResults.has(toolCallId)) {
            reportedToolResults.add(toolCallId);

            // Parse the output - tools return JSON strings
            let output: unknown = event.data?.output;
            if (typeof output === 'string') {
              try {
                output = JSON.parse(output) as unknown;
              } catch {
                // Keep as string if not valid JSON
              }
            }

            yield {
              type: 'tool-output-available',
              toolCallId: event.tags?.[0] ?? toolCallId,
              output,
            };
          }
        } else if (event.event === 'on_chain_end') {
          // Handle subgraph completion - check for pendingUiActions
          // This catches UI actions created by subgraph nodes that don't go through LLM
          const output = event.data?.output as
            | { pendingUiActions?: PendingUiAction[] }
            | null
            | undefined;

          if (output?.pendingUiActions && output.pendingUiActions.length > 0) {
            for (const action of output.pendingUiActions) {
              if (!reportedToolCalls.has(action.toolCallId)) {
                reportedToolCalls.add(action.toolCallId);
                this.logger.debug(
                  `Emitting pendingUiAction from subgraph: ${action.toolName}`,
                );
                // Emit tool-input-available for the tool call
                yield {
                  type: 'tool-input-available',
                  toolCallId: action.toolCallId,
                  toolName: action.toolName,
                  input: action.args,
                };

                // For UI pass-through tools (render_ui_component, request_user_selection),
                // also emit tool-output-available with the args as result so frontend can render
                if (
                  action.toolName === 'render_ui_component' ||
                  action.toolName === 'request_user_selection'
                ) {
                  this.logger.debug(
                    `Emitting tool-output-available for UI pass-through: ${action.toolName}`,
                  );
                  yield {
                    type: 'tool-output-available',
                    toolCallId: action.toolCallId,
                    output: action.args,
                  };
                }
              }
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Stream error: ${error}`);
      throw error;
    }
  }

  /**
   * Process a chat request and return a streaming response.
   * Returns an object with methods compatible with the existing controller.
   */
  chat(messages: Array<{ role: string; content: string }>) {
    const generator = this.streamChat(messages);

    return {
      // Provide an async iterable for streaming
      [Symbol.asyncIterator]: () => generator,

      // For compatibility - convert to UI message stream response
      toUIMessageStreamResponse: async () => {
        const events: Array<{
          type: string;
          delta?: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
          output?: unknown;
        }> = [];

        for await (const event of generator) {
          events.push(event);
        }

        return events;
      },
    };
  }

  /**
   * Check if the AI service is properly configured and ready.
   */
  isReady(): boolean {
    try {
      this.getModel();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the current provider and connection status.
   */
  getStatus(): {
    provider: AIProvider;
    mcpConnected: boolean;
    ready: boolean;
    explicitFlowsEnabled: boolean;
  } {
    return {
      provider: this.getProvider(),
      mcpConnected: this.toolsHttpClient.isConnected(),
      ready: this.isReady(),
      explicitFlowsEnabled: this.isExplicitFlowsEnabled(),
    };
  }

  /**
   * Reset the graph (useful for testing or when config changes).
   */
  resetGraph(): void {
    this.graph = null;
    this.model = null;
    this.logger.log('Graph and model reset');
  }
}
