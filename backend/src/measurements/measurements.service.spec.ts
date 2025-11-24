import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  MeasurementsService,
  MeasurementChartData,
} from './measurements.service';
import { Measurement } from '../database/entities/measurement.entity';

/**
 * Interface for typing the find call options in mock assertions
 */
interface FindCallOptions {
  where: {
    loggerId?: string;
    timestamp: {
      _value: [Date, Date];
    };
  };
}

describe('MeasurementsService', () => {
  let service: MeasurementsService;
  let mockRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    count: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    // Create mock repository
    mockRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeasurementsService,
        {
          provide: getRepositoryToken(Measurement),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<MeasurementsService>(MeasurementsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMeasurements', () => {
    describe('Explicit Mode (both start and end provided)', () => {
      it('should use explicit dates when both start and end are provided', async () => {
        const loggerId = 'LOGGER001';
        const start = new Date('2023-06-15T00:00:00.000Z');
        const end = new Date('2023-06-15T23:59:59.999Z');

        mockRepository.find.mockResolvedValue([]);

        await service.getMeasurements(loggerId, start, end);

        expect(mockRepository.find).toHaveBeenCalledTimes(1);
        expect(mockRepository.find).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            where: expect.objectContaining({
              loggerId: 'LOGGER001',
            }),
          }),
        );

        // Should NOT call findOne for smart date resolution
        expect(mockRepository.findOne).not.toHaveBeenCalled();
      });

      it('should return transformed chart data', async () => {
        const loggerId = 'LOGGER001';
        const start = new Date('2023-06-15T00:00:00.000Z');
        const end = new Date('2023-06-15T23:59:59.999Z');

        const mockMeasurements = [
          {
            timestamp: new Date('2023-06-15T10:00:00.000Z'),
            activePowerWatts: 1500,
            energyDailyKwh: 5.5,
            irradiance: null,
            metadata: {},
          },
          {
            timestamp: new Date('2023-06-15T11:00:00.000Z'),
            activePowerWatts: 1800,
            energyDailyKwh: 6.2,
            irradiance: null,
            metadata: {},
          },
        ];

        mockRepository.find.mockResolvedValue(mockMeasurements);

        const results = await service.getMeasurements(loggerId, start, end);

        expect(results).toHaveLength(2);
        expect(results[0]).toEqual<MeasurementChartData>({
          timestamp: new Date('2023-06-15T10:00:00.000Z'),
          activePowerWatts: 1500,
          energyDailyKwh: 5.5,
          irradiance: null,
          metadata: {},
        });
        expect(results[1]).toEqual<MeasurementChartData>({
          timestamp: new Date('2023-06-15T11:00:00.000Z'),
          activePowerWatts: 1800,
          energyDailyKwh: 6.2,
          irradiance: null,
          metadata: {},
        });
      });
    });

    describe('Implicit Mode - Smart Date Resolution', () => {
      it('should auto-detect date range from latest record when start is missing', async () => {
        const loggerId = 'LOGGER001';
        const latestTimestamp = new Date('2023-01-15T14:30:00.000Z');

        // Mock findOne to return latest record
        mockRepository.findOne.mockResolvedValue({
          timestamp: latestTimestamp,
        });

        // Mock find to return empty (we're testing the date resolution, not the data)
        mockRepository.find.mockResolvedValue([]);

        await service.getMeasurements(loggerId);

        // Should call findOne to get latest timestamp
        expect(mockRepository.findOne).toHaveBeenCalledTimes(1);
        expect(mockRepository.findOne).toHaveBeenCalledWith({
          select: ['timestamp'],
          where: { loggerId: 'LOGGER001' },
          order: { timestamp: 'DESC' },
        });

        // Should call find with the resolved date range
        expect(mockRepository.find).toHaveBeenCalledTimes(1);
      });

      it('should return full day boundaries (00:00:00 to 23:59:59.999 UTC) for latest record date', async () => {
        const loggerId = 'LOGGER001';
        // Latest record is at 14:30 on Jan 15, 2023
        const latestTimestamp = new Date('2023-01-15T14:30:00.000Z');

        mockRepository.findOne.mockResolvedValue({
          timestamp: latestTimestamp,
        });
        mockRepository.find.mockResolvedValue([]);

        await service.getMeasurements(loggerId);

        // Verify find was called with full day boundaries
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        const findCall = mockRepository.find.mock
          .calls[0][0] as FindCallOptions;
        /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        const whereClause = findCall.where;

        // The Between clause should span the full day of Jan 15, 2023 UTC
        // Between(startDate, endDate) where:
        // startDate = 2023-01-15T00:00:00.000Z
        // endDate = 2023-01-15T23:59:59.999Z
        expect(whereClause.timestamp._value[0].toISOString()).toBe(
          '2023-01-15T00:00:00.000Z',
        );
        expect(whereClause.timestamp._value[1].toISOString()).toBe(
          '2023-01-15T23:59:59.999Z',
        );
      });

      it('should fallback to today when no data exists for logger', async () => {
        const loggerId = 'NEW_LOGGER';

        // Mock findOne to return null (no data exists)
        mockRepository.findOne.mockResolvedValue(null);
        mockRepository.find.mockResolvedValue([]);

        // Get today's date boundaries for comparison
        const today = new Date();
        const expectedStartDate = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
            0,
            0,
            0,
            0,
          ),
        );
        const expectedEndDate = new Date(
          Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            today.getUTCDate(),
            23,
            59,
            59,
            999,
          ),
        );

        await service.getMeasurements(loggerId);

        // Verify find was called with today's boundaries
        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        const findCall = mockRepository.find.mock
          .calls[0][0] as FindCallOptions;
        /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        const whereClause = findCall.where;

        // Check the date (ignoring milliseconds for test stability)
        const actualStart = new Date(whereClause.timestamp._value[0]);
        const actualEnd = new Date(whereClause.timestamp._value[1]);

        expect(actualStart.toISOString().split('T')[0]).toBe(
          expectedStartDate.toISOString().split('T')[0],
        );
        expect(actualEnd.toISOString().split('T')[0]).toBe(
          expectedEndDate.toISOString().split('T')[0],
        );
      });

      it('should handle timezone edge case - record near midnight UTC', async () => {
        const loggerId = 'LOGGER001';
        // Record at 23:59 should still use that day
        const latestTimestamp = new Date('2023-07-20T23:59:00.000Z');

        mockRepository.findOne.mockResolvedValue({
          timestamp: latestTimestamp,
        });
        mockRepository.find.mockResolvedValue([]);

        await service.getMeasurements(loggerId);

        /* eslint-disable @typescript-eslint/no-unsafe-member-access */
        const findCall = mockRepository.find.mock
          .calls[0][0] as FindCallOptions;
        /* eslint-enable @typescript-eslint/no-unsafe-member-access */
        const whereClause = findCall.where;

        // Should still be July 20th
        expect(whereClause.timestamp._value[0].toISOString()).toBe(
          '2023-07-20T00:00:00.000Z',
        );
        expect(whereClause.timestamp._value[1].toISOString()).toBe(
          '2023-07-20T23:59:59.999Z',
        );
      });
    });
  });

  describe('getLatestTimestamp', () => {
    it('should return the latest timestamp for a logger', async () => {
      const loggerId = 'LOGGER001';
      const latestTimestamp = new Date('2023-06-15T18:00:00.000Z');

      mockRepository.findOne.mockResolvedValue({
        timestamp: latestTimestamp,
      });

      const result = await service.getLatestTimestamp(loggerId);

      expect(result).toEqual(latestTimestamp);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        select: ['timestamp'],
        where: { loggerId },
        order: { timestamp: 'DESC' },
      });
    });

    it('should return null when no data exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getLatestTimestamp('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('getLoggerIds', () => {
    it('should return list of distinct loggers with types', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { loggerId: 'LOGGER001', loggerType: 'goodwe' },
          { loggerId: 'LOGGER002', loggerType: 'lti' },
          { loggerId: 'LOGGER003', loggerType: 'goodwe' },
        ]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getLoggerIds();

      expect(result).toEqual([
        { loggerId: 'LOGGER001', loggerType: 'goodwe' },
        { loggerId: 'LOGGER002', loggerType: 'lti' },
        { loggerId: 'LOGGER003', loggerType: 'goodwe' },
      ]);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('m');
      expect(mockQueryBuilder.select).toHaveBeenCalledWith(
        'm.loggerId',
        'loggerId',
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'm.loggerType',
        'loggerType',
      );
    });

    it('should return empty array when no loggers exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getLoggerIds();

      expect(result).toEqual([]);
    });
  });

  describe('getMeasurementCount', () => {
    it('should return count for a specific logger', async () => {
      mockRepository.count.mockResolvedValue(1500);

      const result = await service.getMeasurementCount('LOGGER001');

      expect(result).toBe(1500);
      expect(mockRepository.count).toHaveBeenCalledWith({
        where: { loggerId: 'LOGGER001' },
      });
    });

    it('should return 0 for logger with no data', async () => {
      mockRepository.count.mockResolvedValue(0);

      const result = await service.getMeasurementCount('EMPTY_LOGGER');

      expect(result).toBe(0);
    });
  });
});
