import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { McpClient } from './mcp.client';

/**
 * AI Module for handling AI-powered analytics.
 *
 * Components:
 * - AiController: HTTP endpoints for chat and status
 * - AiService: LLM orchestration with multi-provider support
 * - McpClient: Connection to Python FastMCP server
 */
@Module({
  imports: [ConfigModule],
  controllers: [AiController],
  providers: [AiService, McpClient],
  exports: [AiService, McpClient],
})
export class AiModule {}
