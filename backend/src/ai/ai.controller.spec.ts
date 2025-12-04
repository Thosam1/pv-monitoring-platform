import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AiController } from './ai.controller';
import { LanggraphService } from './langgraph.service';
import { ChatRequestDto } from './dto/chat-request.dto';

describe('AiController', () => {
  let controller: AiController;
  let mockLanggraphService: Partial<LanggraphService>;

  beforeEach(async () => {
    mockLanggraphService = {
      isReady: jest.fn().mockReturnValue(true),
      getStatus: jest.fn().mockReturnValue({
        provider: 'gemini',
        mcpConnected: true,
        ready: true,
      }),
      chat: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: LanggraphService, useValue: mockLanggraphService },
      ],
    }).compile();

    controller = module.get<AiController>(AiController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStatus', () => {
    it('should return AI service status', () => {
      const status = controller.getStatus();

      expect(status).toEqual({
        provider: 'gemini',
        mcpConnected: true,
        ready: true,
      });
    });
  });

  describe('chat', () => {
    it('should throw SERVICE_UNAVAILABLE when AI service is not ready', async () => {
      mockLanggraphService.isReady = jest.fn().mockReturnValue(false);

      const body: ChatRequestDto = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await expect(
        controller.chat(body, mockResponse as never),
      ).rejects.toThrow(
        new HttpException(
          'AI service is not properly configured. Check API keys.',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    });

    it('should set SSE headers on successful request', async () => {
      const body: ChatRequestDto = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      // Mock generator that yields events
      function* mockGenerator() {
        yield { type: 'text-delta', delta: 'Hello' };
      }

      const mockResult = {
        [Symbol.asyncIterator]: () => mockGenerator(),
      };

      mockLanggraphService.chat = jest.fn().mockReturnValue(mockResult);

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await controller.chat(body, mockResponse as never);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/event-stream',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-cache',
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Connection',
        'keep-alive',
      );
    });

    it('should set X-Accel-Buffering header for nginx', async () => {
      const body: ChatRequestDto = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      // Empty iterable that yields nothing
      const mockResult = {
        [Symbol.asyncIterator]: function* () {
          // No yields - empty stream
        },
      };

      mockLanggraphService.chat = jest.fn().mockReturnValue(mockResult);

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await controller.chat(body, mockResponse as never);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Accel-Buffering',
        'no',
      );
    });

    it('should handle chat service error before headers sent', async () => {
      const body: ChatRequestDto = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      // Iterable that throws on first iteration
      const mockResult = {
        // eslint-disable-next-line @typescript-eslint/require-await, require-yield
        async *[Symbol.asyncIterator](): AsyncGenerator<{
          type: string;
          delta?: string;
        }> {
          throw new Error('Service error');
        },
      };

      mockLanggraphService.chat = jest.fn().mockReturnValue(mockResult);

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await expect(
        controller.chat(body, mockResponse as never),
      ).rejects.toThrow('Service error');
    });

    it('should write SSE events to response', async () => {
      const body: ChatRequestDto = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      function* mockGenerator() {
        yield { type: 'text-delta', delta: 'Hello' };
        yield { type: 'text-delta', delta: ' World' };
      }

      const mockResult = {
        [Symbol.asyncIterator]: () => mockGenerator(),
      };

      mockLanggraphService.chat = jest.fn().mockReturnValue(mockResult);

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await controller.chat(body, mockResponse as never);

      expect(mockResponse.write).toHaveBeenCalledWith(
        'data: {"type":"text-delta","delta":"Hello"}\n\n',
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        'data: {"type":"text-delta","delta":" World"}\n\n',
      );
      expect(mockResponse.write).toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should convert messages to correct format', async () => {
      const body: ChatRequestDto = {
        messages: [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Second message' },
        ],
      };

      // Empty iterable
      const mockResult = {
        [Symbol.asyncIterator]: function* () {
          // No yields
        },
      };

      mockLanggraphService.chat = jest.fn().mockReturnValue(mockResult);

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await controller.chat(body, mockResponse as never);

      expect(mockLanggraphService.chat).toHaveBeenCalledWith(
        [
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Second message' },
        ],
        undefined, // threadId is optional
      );
    });

    it('should handle tool call events', async () => {
      const body: ChatRequestDto = {
        messages: [{ role: 'user', content: 'Hello' }],
      };

      function* mockGenerator() {
        yield {
          type: 'tool-input-available',
          toolCallId: 'call_123',
          toolName: 'list_loggers',
          input: {},
        };
        yield {
          type: 'tool-output-available',
          toolCallId: 'call_123',
          output: { loggers: [] },
        };
      }

      const mockResult = {
        [Symbol.asyncIterator]: () => mockGenerator(),
      };

      mockLanggraphService.chat = jest.fn().mockReturnValue(mockResult);

      const mockResponse = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        headersSent: false,
      };

      await controller.chat(body, mockResponse as never);

      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('tool-input-available'),
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('tool-output-available'),
      );
    });
  });
});
