import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat-request.dto';

describe('AiController', () => {
  let controller: AiController;
  let mockAiService: Partial<AiService>;

  beforeEach(async () => {
    mockAiService = {
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
      providers: [{ provide: AiService, useValue: mockAiService }],
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
      mockAiService.isReady = jest.fn().mockReturnValue(false);

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

      // Mock streaming response - mimics Web Streams API Response object
      const mockReadableStream = {
        getReader: jest.fn().mockReturnValue({
          read: jest
            .fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('chunk1'),
            })
            .mockResolvedValueOnce({ done: true }),
        }),
      };

      const mockStreamResponse = {
        body: mockReadableStream,
      };

      const mockResult = {
        toUIMessageStreamResponse: jest
          .fn()
          .mockReturnValue(mockStreamResponse),
      };

      mockAiService.chat = jest.fn().mockResolvedValue(mockResult);

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
  });
});
