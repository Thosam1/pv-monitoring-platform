import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService, IngestionResult } from './ingestion.service';

describe('IngestionController', () => {
  let controller: IngestionController;
  let service: jest.Mocked<IngestionService>;

  const mockIngestionService = {
    ingestFile: jest.fn(),
    getSupportedParsers: jest.fn(),
  };

  const createMockFile = (
    originalname: string,
    content = 'test content',
  ): Express.Multer.File => ({
    fieldname: 'files',
    originalname,
    encoding: '7bit',
    mimetype: 'text/csv',
    buffer: Buffer.from(content),
    size: content.length,
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
  });

  const createSuccessResult = (filename: string): IngestionResult => ({
    success: true,
    filename,
    parserUsed: 'goodwe',
    recordsProcessed: 100,
    recordsInserted: 100,
    recordsSkipped: 0,
    errors: [],
    durationMs: 50,
  });

  const createFailureResult = (
    filename: string,
    error: string,
  ): IngestionResult => ({
    success: false,
    filename,
    parserUsed: 'none',
    recordsProcessed: 0,
    recordsInserted: 0,
    recordsSkipped: 0,
    errors: [error],
    durationMs: 10,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IngestionController],
      providers: [
        {
          provide: IngestionService,
          useValue: mockIngestionService,
        },
      ],
    }).compile();

    controller = module.get<IngestionController>(IngestionController);
    service = module.get(IngestionService);
    jest.clearAllMocks();
  });

  describe('ingestFiles', () => {
    it('should throw BadRequestException when no files are uploaded', async () => {
      await expect(controller.ingestFiles('goodwe', [])).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        controller.ingestFiles('goodwe', undefined as never),
      ).rejects.toThrow(BadRequestException);

      expect(service.ingestFile).not.toHaveBeenCalled();
    });

    it('should successfully process a single file', async () => {
      const file = createMockFile('data.csv');
      service.ingestFile.mockResolvedValue(createSuccessResult('data.csv'));

      const result = await controller.ingestFiles('goodwe', [file]);

      expect(result).toEqual({
        successCount: 1,
        errorCount: 0,
        totalRecordsInserted: 100,
        results: [
          {
            filename: 'data.csv',
            success: true,
            parserUsed: 'goodwe',
            recordsInserted: 100,
            recordsProcessed: 100,
            error: undefined,
          },
        ],
      });
      expect(service.ingestFile).toHaveBeenCalledWith(
        'goodwe_data.csv',
        file.buffer,
      );
    });

    it('should successfully process multiple files', async () => {
      const files = [
        createMockFile('file1.csv'),
        createMockFile('file2.csv'),
        createMockFile('file3.csv'),
      ];

      service.ingestFile
        .mockResolvedValueOnce(createSuccessResult('file1.csv'))
        .mockResolvedValueOnce(createSuccessResult('file2.csv'))
        .mockResolvedValueOnce(createSuccessResult('file3.csv'));

      const result = await controller.ingestFiles('goodwe', files);

      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.totalRecordsInserted).toBe(300);
      expect(result.results).toHaveLength(3);
      expect(service.ingestFile).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure', async () => {
      const files = [createMockFile('good.csv'), createMockFile('bad.csv')];

      service.ingestFile
        .mockResolvedValueOnce(createSuccessResult('good.csv'))
        .mockResolvedValueOnce(createFailureResult('bad.csv', 'Parse error'));

      const result = await controller.ingestFiles('goodwe', files);

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
      expect(result.totalRecordsInserted).toBe(100);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('Parse error');
    });

    it('should catch and handle service exceptions per file', async () => {
      const files = [
        createMockFile('good.csv'),
        createMockFile('throws.csv'),
        createMockFile('also-good.csv'),
      ];

      service.ingestFile
        .mockResolvedValueOnce(createSuccessResult('good.csv'))
        .mockRejectedValueOnce(new Error('Database connection lost'))
        .mockResolvedValueOnce(createSuccessResult('also-good.csv'));

      const result = await controller.ingestFiles('lti', files);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.totalRecordsInserted).toBe(200);
      expect(result.results[1]).toEqual({
        filename: 'throws.csv',
        success: false,
        error: 'Database connection lost',
      });
    });

    it('should prepend logger type to filename for parser detection', async () => {
      const file = createMockFile('export.csv');
      service.ingestFile.mockResolvedValue(createSuccessResult('export.csv'));

      await controller.ingestFiles('lti', [file]);

      expect(service.ingestFile).toHaveBeenCalledWith(
        'lti_export.csv',
        expect.any(Buffer),
      );
    });

    it('should handle all files failing', async () => {
      const files = [createMockFile('bad1.csv'), createMockFile('bad2.csv')];

      service.ingestFile
        .mockResolvedValueOnce(createFailureResult('bad1.csv', 'Error 1'))
        .mockResolvedValueOnce(createFailureResult('bad2.csv', 'Error 2'));

      const result = await controller.ingestFiles('goodwe', files);

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(2);
      expect(result.totalRecordsInserted).toBe(0);
    });

    it('should include partial records info in result', async () => {
      const file = createMockFile('partial.csv');
      service.ingestFile.mockResolvedValue({
        success: true,
        filename: 'partial.csv',
        parserUsed: 'goodwe',
        recordsProcessed: 100,
        recordsInserted: 95,
        recordsSkipped: 5,
        errors: ['Row 10: Invalid date'],
        durationMs: 75,
      });

      const result = await controller.ingestFiles('goodwe', [file]);

      expect(result.results[0].recordsProcessed).toBe(100);
      expect(result.results[0].recordsInserted).toBe(95);
      expect(result.results[0].error).toBe('Row 10: Invalid date');
    });
  });
});
