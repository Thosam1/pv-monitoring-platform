import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';

describe('MeasurementsController', () => {
  let controller: MeasurementsController;
  let service: jest.Mocked<MeasurementsService>;

  const mockMeasurementsService = {
    getLoggerIds: jest.fn(),
    getMeasurements: jest.fn(),
    getDateRange: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeasurementsController],
      providers: [
        {
          provide: MeasurementsService,
          useValue: mockMeasurementsService,
        },
      ],
    }).compile();

    controller = module.get<MeasurementsController>(MeasurementsController);
    service = module.get(MeasurementsService);
    jest.clearAllMocks();
  });

  describe('getLoggerIds', () => {
    it('should return list of loggers with their types', async () => {
      const mockLoggers = [
        { loggerId: 'goodwe-001', loggerType: 'goodwe' },
        { loggerId: 'lti-001', loggerType: 'lti' },
      ];
      service.getLoggerIds.mockResolvedValue(mockLoggers);

      const result = await controller.getLoggerIds();

      expect(result).toEqual({
        loggers: [
          { id: 'goodwe-001', type: 'goodwe' },
          { id: 'lti-001', type: 'lti' },
        ],
      });
      expect(service.getLoggerIds).toHaveBeenCalledTimes(1);
    });

    it('should return empty list when no loggers exist', async () => {
      service.getLoggerIds.mockResolvedValue([]);

      const result = await controller.getLoggerIds();

      expect(result).toEqual({ loggers: [] });
    });
  });

  describe('getMeasurements', () => {
    const mockMeasurements = [
      {
        timestamp: new Date('2024-06-15T08:00:00Z'),
        activePowerWatts: 5000,
        energyDailyKwh: 25,
        irradiance: 800,
        metadata: { temperature: 35 },
      },
    ];

    it('should return measurements for a logger without date filters', async () => {
      service.getMeasurements.mockResolvedValue(mockMeasurements);

      const result = await controller.getMeasurements('goodwe-001', {});

      expect(result).toEqual(mockMeasurements);
      expect(service.getMeasurements).toHaveBeenCalledWith(
        'goodwe-001',
        undefined,
        undefined,
      );
    });

    it('should return measurements with start date filter', async () => {
      service.getMeasurements.mockResolvedValue(mockMeasurements);

      const result = await controller.getMeasurements('goodwe-001', {
        start: '2024-06-15T00:00:00Z',
      });

      expect(result).toEqual(mockMeasurements);
      expect(service.getMeasurements).toHaveBeenCalledWith(
        'goodwe-001',
        new Date('2024-06-15T00:00:00Z'),
        undefined,
      );
    });

    it('should return measurements with both start and end date filters', async () => {
      service.getMeasurements.mockResolvedValue(mockMeasurements);

      const result = await controller.getMeasurements('goodwe-001', {
        start: '2024-06-15T00:00:00Z',
        end: '2024-06-15T23:59:59Z',
      });

      expect(result).toEqual(mockMeasurements);
      expect(service.getMeasurements).toHaveBeenCalledWith(
        'goodwe-001',
        new Date('2024-06-15T00:00:00Z'),
        new Date('2024-06-15T23:59:59Z'),
      );
    });

    it('should throw BadRequestException for invalid start date', async () => {
      await expect(
        controller.getMeasurements('goodwe-001', { start: 'invalid-date' }),
      ).rejects.toThrow(BadRequestException);

      expect(service.getMeasurements).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid end date', async () => {
      await expect(
        controller.getMeasurements('goodwe-001', { end: 'not-a-date' }),
      ).rejects.toThrow(BadRequestException);

      expect(service.getMeasurements).not.toHaveBeenCalled();
    });

    it('should return empty array when no measurements exist', async () => {
      service.getMeasurements.mockResolvedValue([]);

      const result = await controller.getMeasurements('nonexistent-logger', {});

      expect(result).toEqual([]);
    });
  });

  describe('getDateRange', () => {
    it('should return date range for a logger', async () => {
      const mockDateRange = {
        earliest: new Date('2024-01-01T00:00:00Z'),
        latest: new Date('2024-06-15T23:59:59Z'),
      };
      service.getDateRange.mockResolvedValue(mockDateRange);

      const result = await controller.getDateRange('goodwe-001');

      expect(result).toEqual(mockDateRange);
      expect(service.getDateRange).toHaveBeenCalledWith('goodwe-001');
    });

    it('should return null dates when logger has no data', async () => {
      const mockDateRange = { earliest: null, latest: null };
      service.getDateRange.mockResolvedValue(mockDateRange);

      const result = await controller.getDateRange('empty-logger');

      expect(result).toEqual({ earliest: null, latest: null });
    });
  });
});
