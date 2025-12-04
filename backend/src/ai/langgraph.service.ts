import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StateGraph,
  START,
  END,
  CompiledStateGraph,
  MemorySaver,
} from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import {
  isAiMessage,
  isSystemMessage,
  isToolMessage,
} from './utils/message-utils';
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
import { createGreetingFlow } from './flows/greeting.flow';
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
  private readonly checkpointer = new MemorySaver();

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
    const greetingGraph = createGreetingFlow(this.toolsHttpClient);
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
      const hasSystemMessage = messages.some((m) => isSystemMessage(m));

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
      const lastMessage = messages.at(-1);

      if (!isToolMessage(lastMessage)) {
        return {};
      }

      const toolMessage = lastMessage;
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
      const lastMessage = state.messages.at(-1);

      if (
        isAiMessage(lastMessage) &&
        lastMessage.tool_calls &&
        lastMessage.tool_calls.length > 0
      ) {
        // SAFETY CHECK: If the ONLY tool calls are virtual UI tools, do NOT go to 'tools' node
        // (because they are handled via pendingUiActions and have no backend implementation)
        const toolCalls = lastMessage.tool_calls;
        const onlyVirtualTools = toolCalls.every(
          (tc) =>
            tc.name === 'render_ui_component' ||
            tc.name === 'request_user_selection',
        );

        if (onlyVirtualTools) {
          this.logger.debug('Skipping tools node for virtual UI tools');
          return 'end';
        }

        this.logger.debug('Routing to tools node');
        return 'tools';
      }

      this.logger.debug('Routing to end');
      return 'end';
    };

    /**
     * Determines if the loop should continue, recover, or end after tool execution.
     *
     * CRITICAL: UI rendering tools (render_ui_component, request_user_selection)
     * are TERMINAL actions - the turn ends after they execute.
     */
    const shouldRecover = (
      state: ExplicitFlowState,
    ): 'recovery' | 'llm' | 'end' => {
      const messages = state.messages;

      // Check if last AIMessage called a terminal UI tool
      // We need to look at the most recent AIMessage (before the ToolMessage)
      const lastAiMessageIndex = messages.findLastIndex((m) => isAiMessage(m));
      if (lastAiMessageIndex >= 0) {
        const lastAiMessage = messages[lastAiMessageIndex] as AIMessage;
        const toolCalls = lastAiMessage.tool_calls || [];

        const hasTerminalUiTool = toolCalls.some(
          (tc) =>
            tc.name === 'render_ui_component' ||
            tc.name === 'request_user_selection',
        );

        if (hasTerminalUiTool) {
          // UI has been rendered - STOP THE LOOP
          this.logger.debug('Terminal UI tool detected, ending free chat loop');
          return 'end';
        }
      }

      // Check for recovery (existing logic)
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
      .addNode('greeting', async (state) => {
        const result = await greetingGraph.invoke(state);
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
        greeting: 'greeting',
      })

      // Edges: Workflow completions
      .addEdge('morning_briefing', END)
      .addEdge('financial_report', END)
      .addEdge('performance_audit', END)
      .addEdge('health_check', END)
      .addEdge('greeting', END)

      // Edges: Free chat loop
      .addConditionalEdges('free_chat', shouldContinue, {
        tools: 'tools',
        end: END,
      })
      .addEdge('tools', 'check_results')
      .addConditionalEdges('check_results', shouldRecover, {
        recovery: 'recovery',
        llm: 'free_chat',
        end: END, // Terminal route for UI tools (breaks recursion loop)
      })

      // Edges: Recovery completion
      .addEdge('recovery', END)

      .compile({ checkpointer: this.checkpointer });

    this.logger.log('Explicit flow graph compiled with checkpointer');
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
      const hasSystemMessage = messages.some((m) => isSystemMessage(m));

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
      const lastMessage = messages.at(-1);

      if (!isToolMessage(lastMessage)) {
        return {};
      }

      const toolMessage = lastMessage;
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
      const lastMessage = state.messages.at(-1);

      if (
        isAiMessage(lastMessage) &&
        lastMessage.tool_calls &&
        lastMessage.tool_calls.length > 0
      ) {
        // SAFETY CHECK: If the ONLY tool calls are virtual UI tools, do NOT go to 'tools' node
        // (because they are handled via pendingUiActions and have no backend implementation)
        const toolCalls = lastMessage.tool_calls;
        const onlyVirtualTools = toolCalls.every(
          (tc) =>
            tc.name === 'render_ui_component' ||
            tc.name === 'request_user_selection',
        );

        if (onlyVirtualTools) {
          this.logger.debug(
            'Legacy graph: Skipping tools node for virtual UI tools',
          );
          return 'end';
        }

        return 'tools';
      }

      return 'end';
    };

    /**
     * Legacy graph: Check if we should continue or end after tool execution.
     * Terminal UI tools (render_ui_component, request_user_selection) end the loop.
     */
    const shouldContinueAfterTools = (
      state: ExplicitFlowState,
    ): 'llm' | 'end' => {
      const messages = state.messages;

      // Check if last AIMessage called a terminal UI tool
      const lastAiMessageIndex = messages.findLastIndex((m) => isAiMessage(m));
      if (lastAiMessageIndex >= 0) {
        const lastAiMessage = messages[lastAiMessageIndex] as AIMessage;
        const toolCalls = lastAiMessage.tool_calls || [];

        const hasTerminalUiTool = toolCalls.some(
          (tc) =>
            tc.name === 'render_ui_component' ||
            tc.name === 'request_user_selection',
        );

        if (hasTerminalUiTool) {
          this.logger.debug(
            'Legacy graph: Terminal UI tool detected, ending loop',
          );
          return 'end';
        }
      }

      return 'llm';
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
      .addConditionalEdges('check_results', shouldContinueAfterTools, {
        llm: 'llm',
        end: END,
      })
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
   * Extract flow context from message history.
   * Looks for hidden metadata in assistant messages that was embedded
   * when waiting for user selection input.
   */
  private extractFlowContextFromMessages(
    messages: BaseMessage[],
  ): Partial<ExplicitFlowState> | undefined {
    // Look for flow metadata in recent assistant messages (search backwards)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (isAiMessage(msg)) {
        const content = typeof msg.content === 'string' ? msg.content : '';
        const match = /<!-- (\{"__flowContext":.+?\}) -->/s.exec(content);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]) as {
              __flowContext: {
                activeFlow?: string;
                currentPromptArg?: string;
                waitingForUserInput?: boolean;
                extractedArgs?: Record<string, unknown>;
              };
            };
            const ctx = parsed.__flowContext;
            this.logger.debug(
              `[FLOW CONTEXT] Restored from message: activeFlow=${ctx.activeFlow}, waitingForUserInput=${ctx.waitingForUserInput}`,
            );
            return {
              activeFlow: ctx.activeFlow as ExplicitFlowState['activeFlow'],
              flowStep: 0,
              flowContext: {
                currentPromptArg: ctx.currentPromptArg,
                waitingForUserInput: ctx.waitingForUserInput,
                extractedArgs: ctx.extractedArgs,
              },
            };
          } catch (e) {
            this.logger.warn(`[FLOW CONTEXT] Failed to parse metadata: ${e}`);
          }
        }
      }
    }
    return undefined;
  }

  /**
   * Strip hidden flow metadata from message content.
   * Flow context is embedded as HTML comments for persistence across invocations.
   */
  private stripFlowMetadata(text: string): string {
    return text.replace(/\n?\n?<!-- \{"__flowContext":.+?\} -->/s, '');
  }

  /**
   * Extract text content from various LangChain content formats.
   * Handles string content, array content with text blocks, and nested objects.
   */
  private extractTextFromContent(content: unknown): string | null {
    if (typeof content === 'string') {
      return this.stripFlowMetadata(content) || null;
    }

    if (Array.isArray(content)) {
      const textParts: string[] = [];
      for (const part of content) {
        if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          (part as { type: string }).type === 'text' &&
          'text' in part &&
          typeof (part as { text: unknown }).text === 'string'
        ) {
          const cleaned = this.stripFlowMetadata(
            (part as { text: string }).text,
          );
          if (cleaned) {
            textParts.push(cleaned);
          }
        }
      }
      return textParts.length > 0 ? textParts.join('') : null;
    }

    return null;
  }

  /**
   * Check if a node is internal and should not emit text to the frontend.
   * Internal nodes produce JSON classification or internal state, not user-facing content.
   */
  private isInternalNode(nodeName: string | undefined): boolean {
    const INTERNAL_NODES = new Set([
      'router', // Produces classification JSON like {"flow":"health_check"...}
      'check_context', // Internal state check
      'check_results', // Internal recovery check
    ]);
    return nodeName ? INTERNAL_NODES.has(nodeName) : false;
  }

  // ============================================================================
  // Stream Event Handlers - Extracted to reduce cognitive complexity
  // ============================================================================

  /** Event type for stream emissions */
  private readonly StreamEvent = {} as {
    type: string;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
  };

  /**
   * Process text content from on_chat_model_stream event.
   * Returns event array to emit, or empty array to skip.
   */
  private processStreamChunk(
    nodeName: string | undefined,
    content: string | unknown[] | undefined,
  ): Array<typeof this.StreamEvent> {
    if (this.isInternalNode(nodeName) || !content) return [];
    const cleanContent = this.extractTextFromContent(content);
    if (!cleanContent) return [];
    return [{ type: 'text-delta', delta: cleanContent }];
  }

  /**
   * Process tool calls from on_chat_model_end event.
   * Returns event array to emit, modifies reportedToolCalls set.
   */
  private processToolCalls(
    toolCalls: Array<{ id?: string; name: string; args: unknown }>,
    reportedToolCalls: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const events: Array<typeof this.StreamEvent> = [];
    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.id ?? `tool_${Date.now()}`;
      if (reportedToolCalls.has(toolCallId)) continue;

      reportedToolCalls.add(toolCallId);
      events.push({
        type: 'tool-input-available',
        toolCallId,
        toolName: toolCall.name,
        input: toolCall.args,
      });

      if (toolCall.name === 'render_ui_component') {
        events.push({
          type: 'tool-output-available',
          toolCallId,
          output: toolCall.args,
        });
      }
    }
    return events;
  }

  /**
   * Process tool result from on_tool_end event.
   * Returns event array to emit, modifies reportedToolResults set.
   */
  private processToolResult(
    runId: string | undefined,
    output: unknown,
    tags: string[] | undefined,
    reportedToolResults: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const toolCallId = runId ?? `tool_result_${Date.now()}`;
    if (reportedToolResults.has(toolCallId)) return [];

    reportedToolResults.add(toolCallId);
    let parsedOutput = output;
    if (typeof parsedOutput === 'string') {
      try {
        parsedOutput = JSON.parse(parsedOutput) as unknown;
      } catch {
        // Keep as string
      }
    }
    return [
      {
        type: 'tool-output-available',
        toolCallId: tags?.[0] ?? toolCallId,
        output: parsedOutput,
      },
    ];
  }

  /**
   * Process pending UI actions from chain output.
   * Returns event array to emit, modifies reportedToolCalls set.
   */
  private processPendingUiActions(
    actions: PendingUiAction[],
    reportedToolCalls: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const events: Array<typeof this.StreamEvent> = [];
    for (const action of actions) {
      if (reportedToolCalls.has(action.toolCallId)) continue;

      reportedToolCalls.add(action.toolCallId);
      events.push({
        type: 'tool-input-available',
        toolCallId: action.toolCallId,
        toolName: action.toolName,
        input: action.args,
      });

      if (action.toolName === 'render_ui_component') {
        events.push({
          type: 'tool-output-available',
          toolCallId: action.toolCallId,
          output: action.args,
        });
      }
    }
    return events;
  }

  /**
   * Process tool_calls embedded in AIMessages.
   * Returns event array to emit, modifies reportedToolCalls set.
   */
  private processAiMessageToolCalls(
    messages: BaseMessage[],
    reportedToolCalls: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const events: Array<typeof this.StreamEvent> = [];
    for (const msg of messages) {
      if (!isAiMessage(msg)) continue;
      const aiMsg = msg;
      if (!aiMsg.tool_calls?.length) continue;

      for (const toolCall of aiMsg.tool_calls) {
        const toolCallId = toolCall.id ?? `tool_${Date.now()}`;
        if (reportedToolCalls.has(toolCallId)) continue;

        reportedToolCalls.add(toolCallId);
        events.push({
          type: 'tool-input-available',
          toolCallId,
          toolName: toolCall.name,
          input: toolCall.args,
        });

        if (toolCall.name === 'render_ui_component') {
          events.push({
            type: 'tool-output-available',
            toolCallId,
            output: toolCall.args,
          });
        }
      }
    }
    return events;
  }

  /**
   * Strip hidden flow metadata from message content.
   */
  private stripFlowMetadata(text: string): string {
    return text.replace(/\n?\n?<!-- \{"__flowContext":.+?\} -->/s, '');
  }

  /**
   * Process flow messages (text content from AIMessages).
   * Returns event array to emit, modifies reportedFlowMessages set.
   */
  private processFlowMessages(
    messages: BaseMessage[],
    reportedFlowMessages: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const events: Array<typeof this.StreamEvent> = [];

    for (const msg of messages) {
      if (!isAiMessage(msg)) continue;
      const textEvents = this.extractTextFromAiMessage(
        msg,
        reportedFlowMessages,
      );
      events.push(...textEvents);
    }
    return events;
  }

  /**
   * Extract text events from an AIMessage.
   */
  private extractTextFromAiMessage(
    msg: BaseMessage,
    reportedFlowMessages: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const events: Array<typeof this.StreamEvent> = [];

    if (typeof msg.content === 'string' && msg.content.trim()) {
      const cleanContent = this.stripFlowMetadata(msg.content);
      if (cleanContent.trim()) {
        const msgKey = cleanContent.trim();
        if (!reportedFlowMessages.has(msgKey)) {
          reportedFlowMessages.add(msgKey);
          events.push({ type: 'text-delta', delta: cleanContent });
        }
      }
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        const textEvent = this.extractTextFromContentPart(
          part,
          reportedFlowMessages,
        );
        if (textEvent) events.push(textEvent);
      }
    }
    return events;
  }

  /**
   * Extract text event from a content part.
   */
  private extractTextFromContentPart(
    part: unknown,
    reportedFlowMessages: Set<string>,
  ): typeof this.StreamEvent | null {
    if (
      typeof part !== 'object' ||
      part === null ||
      !('type' in part) ||
      part.type !== 'text' ||
      !('text' in part) ||
      typeof part.text !== 'string' ||
      !part.text.trim()
    ) {
      return null;
    }

    const cleanContent = this.stripFlowMetadata(part.text);
    if (!cleanContent.trim()) return null;

    const partKey = cleanContent.trim();
    if (reportedFlowMessages.has(partKey)) return null;

    reportedFlowMessages.add(partKey);
    return { type: 'text-delta', delta: cleanContent };
  }

  /**
   * Process a single stream event and return events to emit.
   * Central dispatcher that reduces cognitive complexity of streamChat.
   */
  private processStreamEvent(
    event: {
      event: string;
      data?: unknown;
      metadata?: unknown;
      run_id?: string;
      tags?: string[];
    },
    reportedToolCalls: Set<string>,
    reportedToolResults: Set<string>,
    reportedFlowMessages: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const metadata = event.metadata as { langgraph_node?: string } | undefined;
    const nodeName = metadata?.langgraph_node;

    switch (event.event) {
      case 'on_chat_model_stream':
        return this.handleModelStream(event, nodeName);

      case 'on_chat_model_end':
        return this.handleModelEnd(event, nodeName, reportedToolCalls);

      case 'on_tool_end': {
        const toolData = event.data as { output?: unknown } | undefined;
        return this.processToolResult(
          event.run_id,
          toolData?.output,
          event.tags,
          reportedToolResults,
        );
      }

      case 'on_chain_end':
        return this.handleChainEnd(
          event,
          reportedToolCalls,
          reportedFlowMessages,
        );

      default:
        return [];
    }
  }

  /**
   * Handle on_chat_model_stream event.
   */
  private handleModelStream(
    event: { data?: unknown },
    nodeName: string | undefined,
  ): Array<typeof this.StreamEvent> {
    if (this.isInternalNode(nodeName)) return [];

    const data = event.data as
      | { chunk?: { content?: string | unknown[] } }
      | undefined;
    return this.processStreamChunk(nodeName, data?.chunk?.content);
  }

  /**
   * Handle on_chat_model_end event.
   */
  private handleModelEnd(
    event: { data?: unknown },
    nodeName: string | undefined,
    reportedToolCalls: Set<string>,
  ): Array<typeof this.StreamEvent> {
    if (this.isInternalNode(nodeName)) return [];

    const data = event.data as
      | {
          output?: {
            tool_calls?: Array<{ id?: string; name: string; args: unknown }>;
          };
        }
      | undefined;
    const toolCalls = data?.output?.tool_calls;
    if (!toolCalls?.length) return [];

    return this.processToolCalls(toolCalls, reportedToolCalls);
  }

  /**
   * Handle on_chain_end event.
   */
  private handleChainEnd(
    event: { data?: unknown },
    reportedToolCalls: Set<string>,
    reportedFlowMessages: Set<string>,
  ): Array<typeof this.StreamEvent> {
    const data = event.data as
      | {
          output?: {
            pendingUiActions?: PendingUiAction[];
            messages?: BaseMessage[];
          };
        }
      | undefined;
    const output = data?.output;
    if (!output) return [];

    const events: Array<typeof this.StreamEvent> = [];

    // Process pending UI actions
    if (output.pendingUiActions?.length) {
      events.push(
        ...this.processPendingUiActions(
          output.pendingUiActions,
          reportedToolCalls,
        ),
      );
    }

    // Process AIMessage tool calls
    if (output.messages?.length) {
      events.push(
        ...this.processAiMessageToolCalls(output.messages, reportedToolCalls),
      );
    }

    // Process flow messages (only if no pendingUiActions to avoid duplicates)
    if (output.messages?.length && !output.pendingUiActions?.length) {
      events.push(
        ...this.processFlowMessages(output.messages, reportedFlowMessages),
      );
    }

    return events;
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
    threadId?: string,
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

    // Debug logging counters
    const debugCounters = {
      routerCalls: 0,
      greetingFlowCalls: 0,
      freeChatCalls: 0,
      toolInputEmissions: 0,
      toolOutputEmissions: 0,
      textEmissions: 0,
      flowMessages: 0,
      dedupSkips: {
        toolCalls: 0,
        toolResults: 0,
        flowMessages: 0,
      },
      eventsProcessed: 0,
    };

    // Debug logging entry point
    this.logger.debug('[DEBUG ENTRY] === NEW REQUEST ===');
    this.logger.debug(
      '[DEBUG ENTRY] Incoming messages count:',
      messages.length,
    );
    this.logger.debug(
      '[DEBUG ENTRY] Last user message:',
      messages.at(-1)?.content?.slice(0, 100),
    );

    // Track tool calls and flow messages we've already reported (for deduplication)
    const reportedToolCalls = new Set<string>();
    const reportedToolResults = new Set<string>();
    const reportedFlowMessages = new Set<string>();

    // PRE-FILL: Mark all incoming messages as "already reported"
    // This prevents re-emitting historical messages from checkpointed state
    for (const msg of langchainMessages) {
      // Generate consistent key for message deduplication
      const msgId = msg.id;
      const msgContent =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);

      // Use ID if available, otherwise use content hash
      const msgKey = msgId || msgContent;
      if (msgKey) {
        reportedFlowMessages.add(msgKey);
      }

      // Also pre-fill tool calls from historical AIMessages
      if (isAiMessage(msg)) {
        const aiMsg = msg;
        if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
          for (const tc of aiMsg.tool_calls) {
            if (tc.id) {
              reportedToolCalls.add(tc.id);
            }
          }
        }
      }
    }

    this.logger.debug(
      `[DEDUP PREFILL] Pre-filled ${reportedFlowMessages.size} messages, ${reportedToolCalls.size} tool calls`,
    );

    if (!graph) {
      throw new Error('Failed to build chat graph');
    }

    try {
      // Check for preserved flow context from previous selection prompt
      const preservedContext =
        this.extractFlowContextFromMessages(langchainMessages);

      // Build initial state - include preserved context if available
      const initialState: Partial<ExplicitFlowState> = {
        messages: langchainMessages,
      };

      if (preservedContext) {
        this.logger.debug(
          `[FLOW CONTEXT] Passing preserved context: activeFlow=${preservedContext.activeFlow}`,
        );
        initialState.activeFlow = preservedContext.activeFlow;
        initialState.flowStep = preservedContext.flowStep;
        initialState.flowContext = preservedContext.flowContext;
      }

      // Stream events from the graph
      // Generate fallback thread_id if not provided - MemorySaver ALWAYS requires one
      let effectiveThreadId = threadId;
      if (effectiveThreadId === undefined) {
        effectiveThreadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      }
      this.logger.debug(
        `[CHECKPOINTING] Using thread_id: ${effectiveThreadId}${threadId ? '' : ' (auto-generated)'}`,
      );

      const stream = graph.streamEvents(initialState, {
        version: 'v2',
        configurable: { thread_id: effectiveThreadId },
      });

      for await (const event of stream) {
        const events = this.processStreamEvent(
          event,
          reportedToolCalls,
          reportedToolResults,
          reportedFlowMessages,
        );
        for (const e of events) {
          yield e;
        }
      }

      // TODO: DELETE - Debug logging summary
      this.logger.debug('[DEBUG SUMMARY] === REQUEST COMPLETE ===');
      this.logger.debug(
        '[DEBUG SUMMARY] Counters:',
        JSON.stringify(debugCounters, null, 2),
      );
      this.logger.debug('[DEBUG SUMMARY] reportedToolCalls:', [
        ...reportedToolCalls,
      ]);
      this.logger.debug('[DEBUG SUMMARY] reportedToolResults:', [
        ...reportedToolResults,
      ]);
      this.logger.debug(
        '[DEBUG SUMMARY] reportedFlowMessages:',
        [...reportedFlowMessages].map((m) => m.slice(0, 50)),
      );
    } catch (error) {
      this.logger.error(`Stream error: ${error}`);
      throw error;
    }
  }

  /**
   * Process a chat request and return a streaming response.
   * Returns an object with methods compatible with the existing controller.
   *
   * @param messages - Chat message history
   * @param threadId - Optional thread ID for checkpointing (state persistence)
   */
  chat(messages: Array<{ role: string; content: string }>, threadId?: string) {
    const generator = this.streamChat(messages, threadId);

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
