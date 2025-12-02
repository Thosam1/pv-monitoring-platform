import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { LanggraphService } from './langgraph.service';
import { ToolsHttpClient } from './tools-http.client';

/**
 * AI Module for handling AI-powered analytics via LangGraph.
 *
 * Components:
 * - AiController: HTTP endpoints for chat and status
 * - LanggraphService: StateGraph-based LLM orchestration with multi-provider support
 * - ToolsHttpClient: HTTP client for Python solar-analyst tools
 */
@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [LanggraphService, ToolsHttpClient],
  exports: [LanggraphService, ToolsHttpClient],
})
export class AiModule {}
