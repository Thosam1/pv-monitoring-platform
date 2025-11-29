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
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat-request.dto';
/**
 * Message type for AI chat (replaces deprecated CoreMessage).
 */
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * AI Controller for handling chat interactions.
 *
 * Endpoints:
 * - POST /ai/chat: Stream a chat response
 * - GET /ai/status: Check AI service status
 */
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(private readonly aiService: AiService) {}

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
    this.logger.log(
      `Chat request received with ${body.messages.length} messages`,
    );

    // Validate that AI service is ready
    if (!this.aiService.isReady()) {
      throw new HttpException(
        'AI service is not properly configured. Check API keys.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      // Convert DTO messages to ChatMessage format
      const messages: ChatMessage[] = body.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Get the streaming response
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.aiService.chat(messages);

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

      // Stream the response using Vercel AI SDK v5's toUIMessageStreamResponse
      // This includes tool calls and results, not just text
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const streamResponse = result.toUIMessageStreamResponse();

      // Get the readable stream from the Response object
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const stream = streamResponse.body;
      if (!stream) {
        throw new Error('No stream body in response');
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const reader = stream.getReader();

      const pump = async (): Promise<void> => {
        try {
          while (true) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            res.write(value);
          }
        } catch (error) {
          this.logger.error(`Stream error: ${error}`);
          res.end();
        }
      };

      await pump();
    } catch (error) {
      this.logger.error(`Chat error: ${error}`);

      if (!res.headersSent) {
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
    return this.aiService.getStatus();
  }
}
