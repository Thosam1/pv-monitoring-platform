import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Measurement } from '../database/entities/measurement.entity';

/**
 * DTO for chart data with full metrics
 * Includes all fields needed for advanced visualization
 */
export interface MeasurementChartData {
  timestamp: Date;
  activePowerWatts: number | null;
  energyDailyKwh: number | null;
  irradiance: number | null;
  metadata: Record<string, unknown>;
}

/**
 * Logger info with type
 */
export interface LoggerInfo {
  loggerId: string;
  loggerType: string;
}

@Injectable()
export class MeasurementsService {
  private readonly logger = new Logger(MeasurementsService.name);

  constructor(
    @InjectRepository(Measurement)
    private readonly measurementRepository: Repository<Measurement>,
  ) {}

  /**
   * Get measurements for a specific logger within a date range
   *
   * Smart Date Resolution:
   * - Explicit Mode: If start AND end are provided, use them directly
   * - Implicit Mode: If start is missing, auto-detect based on latest data:
   *   1. Find the latest timestamp for this logger
   *   2. Return the full day (00:00:00 to 23:59:59) of that date
   *   3. Fallback to today if no data exists
   *
   * @param loggerId - Logger serial number
   * @param start - Start date (optional)
   * @param end - End date (optional)
   * @returns Array of measurement data points
   */
  async getMeasurements(
    loggerId: string,
    start?: Date,
    end?: Date,
  ): Promise<MeasurementChartData[]> {
    let startDate: Date;
    let endDate: Date;

    // Explicit Mode: Both dates provided by user
    if (start && end) {
      startDate = start;
      endDate = end;
      this.logger.debug(
        `Explicit mode: ${startDate.toISOString()} to ${endDate.toISOString()}`,
      );
    } else {
      // Implicit Mode: Auto-detect based on latest data
      const { startDate: autoStart, endDate: autoEnd } =
        await this.resolveSmartDateRange(loggerId);
      startDate = autoStart;
      endDate = autoEnd;
      this.logger.debug(
        `Auto-detected date range: ${startDate.toISOString()} to ${endDate.toISOString()}`,
      );
    }

    this.logger.debug(
      `Fetching measurements for ${loggerId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    // Select all fields needed for advanced visualization
    const measurements = await this.measurementRepository.find({
      select: [
        'timestamp',
        'loggerType',
        'activePowerWatts',
        'energyDailyKwh',
        'irradiance',
        'metadata',
      ],
      where: {
        loggerId,
        timestamp: Between(startDate, endDate),
      },
      order: { timestamp: 'ASC' },
    });

    this.logger.debug(`Found ${measurements.length} measurements`);

    // Logger types that store interval energy (not cumulative)
    // These need cumulative calculation so charts show energy increasing over time
    const CUMULATIVE_ENERGY_LOGGERS = ['smartdog', 'meier', 'lti'];
    const loggerType = measurements[0]?.loggerType;

    if (
      CUMULATIVE_ENERGY_LOGGERS.includes(loggerType ?? '') &&
      measurements.length > 0
    ) {
      const cumulativeEnergies = this.calculateCumulativeEnergy(
        measurements,
        loggerType ?? '',
      );
      this.logger.debug(
        `${loggerType} cumulative energy: 0 -> ${cumulativeEnergies[cumulativeEnergies.length - 1]?.toFixed(2)} kWh`,
      );

      return measurements.map((m, index) => ({
        timestamp: m.timestamp,
        activePowerWatts: m.activePowerWatts,
        energyDailyKwh: cumulativeEnergies[index],
        irradiance: m.irradiance,
        metadata: m.metadata ?? {},
      }));
    }

    return measurements.map((m) => ({
      timestamp: m.timestamp,
      activePowerWatts: m.activePowerWatts,
      energyDailyKwh: m.energyDailyKwh,
      irradiance: m.irradiance,
      metadata: m.metadata ?? {},
    }));
  }

  /**
   * Calculate cumulative energy from interval values
   *
   * Different loggers store interval energy differently:
   * - SmartDog: metadata.energyIntervalKwh (derived from pac / 12000)
   * - LTI: metadata.energyInterval (e_int field from file)
   * - Meier: energyDailyKwh column (from GENERAL.Yield, actually interval energy)
   *
   * Returns an array of cumulative energy values, one per record,
   * so the chart shows energy increasing throughout the day.
   *
   * @param measurements Array of measurement records
   * @param loggerType Logger type to determine energy source
   * @returns Array of cumulative energy values in kWh
   */
  private calculateCumulativeEnergy(
    measurements: Array<{
      energyDailyKwh: number | null;
      metadata: Record<string, unknown>;
    }>,
    loggerType: string,
  ): Array<number | null> {
    const cumulativeEnergies: Array<number | null> = [];
    let runningTotal = 0;
    let hasValidData = false;

    for (const m of measurements) {
      // Get interval energy based on logger type
      let intervalEnergy: number | null = null;

      if (loggerType === 'smartdog') {
        // SmartDog: interval energy derived from power, stored in metadata
        const metaEnergy = m.metadata?.energyIntervalKwh;
        if (typeof metaEnergy === 'number' && !Number.isNaN(metaEnergy)) {
          intervalEnergy = metaEnergy;
        }
      } else if (loggerType === 'lti') {
        // LTI: interval energy stored as metadata.energyInterval (kWh)
        const metaEnergy = m.metadata?.energyInterval;
        if (typeof metaEnergy === 'number' && !Number.isNaN(metaEnergy)) {
          intervalEnergy = metaEnergy;
        }
      } else if (loggerType === 'meier') {
        // Meier: "Yield" is stored in energyDailyKwh but it's actually interval energy
        intervalEnergy = m.energyDailyKwh;
      }

      if (intervalEnergy !== null && !Number.isNaN(intervalEnergy)) {
        runningTotal += intervalEnergy;
        hasValidData = true;
      }

      // Push current cumulative total (or null if no valid data yet)
      cumulativeEnergies.push(hasValidData ? runningTotal : null);
    }

    return cumulativeEnergies;
  }

  /**
   * Smart Date Range Resolution
   *
   * Finds the latest data point for a logger and returns the full day boundaries
   * for that date. This ensures we always show data regardless of when it was recorded.
   *
   * @param loggerId - Logger serial number
   * @returns Start (00:00:00) and end (23:59:59.999) of the day with latest data
   */
  private async resolveSmartDateRange(
    loggerId: string,
  ): Promise<{ startDate: Date; endDate: Date }> {
    // Query for the latest timestamp for this logger
    const latestRecord = await this.measurementRepository.findOne({
      select: ['timestamp'],
      where: { loggerId },
      order: { timestamp: 'DESC' },
    });

    let targetDate: Date;

    if (latestRecord) {
      // Use the date of the latest record
      targetDate = new Date(latestRecord.timestamp);
      this.logger.debug(`Latest record found: ${targetDate.toISOString()}`);
    } else {
      // No data found, fallback to today
      targetDate = new Date();
      this.logger.debug(`No data found for ${loggerId}, falling back to today`);
    }

    // Calculate day boundaries (UTC)
    const startDate = new Date(
      Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );

    const endDate = new Date(
      Date.UTC(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth(),
        targetDate.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );

    return { startDate, endDate };
  }

  /**
   * Get the latest timestamp for a logger
   * Useful for frontend to know what date range is available
   */
  async getLatestTimestamp(loggerId: string): Promise<Date | null> {
    const record = await this.measurementRepository.findOne({
      select: ['timestamp'],
      where: { loggerId },
      order: { timestamp: 'DESC' },
    });

    return record?.timestamp ?? null;
  }

  /**
   * Get the earliest timestamp for a logger
   */
  async getEarliestTimestamp(loggerId: string): Promise<Date | null> {
    const record = await this.measurementRepository.findOne({
      select: ['timestamp'],
      where: { loggerId },
      order: { timestamp: 'ASC' },
    });

    return record?.timestamp ?? null;
  }

  /**
   * Get the date range (earliest and latest) for a logger
   * Returns null values if no data exists
   */
  async getDateRange(
    loggerId: string,
  ): Promise<{ earliest: Date | null; latest: Date | null }> {
    const [earliest, latest] = await Promise.all([
      this.getEarliestTimestamp(loggerId),
      this.getLatestTimestamp(loggerId),
    ]);

    return { earliest, latest };
  }

  /**
   * Get list of all logger IDs with their types
   */
  async getLoggerIds(): Promise<LoggerInfo[]> {
    const result = await this.measurementRepository
      .createQueryBuilder('m')
      .select('m.loggerId', 'loggerId')
      .addSelect('m.loggerType', 'loggerType')
      .groupBy('m.loggerId')
      .addGroupBy('m.loggerType')
      .getRawMany<{ loggerId: string; loggerType: string }>();

    return result.map((r) => ({
      loggerId: r.loggerId,
      loggerType: r.loggerType,
    }));
  }

  /**
   * Get measurement count for a logger
   */
  async getMeasurementCount(loggerId: string): Promise<number> {
    return this.measurementRepository.count({
      where: { loggerId },
    });
  }
}
