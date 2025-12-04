import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Logger,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import type { Response } from 'express';
import { LanggraphService } from './langgraph.service';
import { ChatRequestDto } from './dto/chat-request.dto';

/**
 * AI Controller for handling chat interactions via LangGraph.
 *
 * Endpoints:
 * - POST /ai/chat: Stream a chat response
 * - GET /ai/status: Check AI service status
 */
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly langgraphService: LanggraphService) {}

  /**
   * Stream a chat response.
   *
   * Uses Server-Sent Events (SSE) to stream the response to the client.
   * The response includes text chunks and tool invocations.
   */
  @Post('chat')
  async chat(
    @Body() body: ChatRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    const threadIdSuffix = body.threadId ? `, threadId: ${body.threadId}` : '';
    this.logger.log(
      `Chat request received with ${body.messages.length} messages${threadIdSuffix}`,
    );

    // Validate that AI service is ready
    if (!this.langgraphService.isReady()) {
      throw new HttpException(
        'AI service is not properly configured. Check API keys.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      // Convert DTO messages to simple format
      const messages = body.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Stream the response using LangGraph's async generator
      // Pass threadId for checkpointing (enables state persistence for multi-turn flows)
      const stream = this.langgraphService.chat(messages, body.threadId);

      for await (const event of stream) {
        // Format events to match the frontend's expected SSE format
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      // Send the done signal
      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      this.logger.error(`Chat error: ${error}`);

      if (res.headersSent) {
        // If headers already sent, send error as SSE event
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' })}\n\n`,
        );
        res.end();
      } else {
        throw new HttpException(
          error instanceof Error ? error.message : 'Chat processing failed',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  /**
   * Get the AI service status.
   *
   * Returns information about the current provider, MCP connection,
   * and overall readiness.
   */
  @Get('status')
  getStatus(): {
    provider: string;
    mcpConnected: boolean;
    ready: boolean;
  } {
    return this.langgraphService.getStatus();
  }
}
