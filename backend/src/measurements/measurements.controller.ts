import {
  Controller,
  Get,
  Param,
  Query,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import {
  MeasurementsService,
  MeasurementChartData,
} from './measurements.service';

/**
 * Query parameters for measurements endpoint
 */
interface MeasurementsQuery {
  start?: string;
  end?: string;
}

/**
 * MeasurementsController
 *
 * Provides read endpoints for measurement data visualization.
 *
 * Endpoints:
 * - GET /measurements/:loggerId - Get measurements for a logger
 * - GET /measurements/loggers - Get list of all logger IDs
 */
@Controller('measurements')
export class MeasurementsController {
  private readonly logger = new Logger(MeasurementsController.name);

  constructor(private readonly measurementsService: MeasurementsService) {}

  /**
   * Get measurements for a specific logger
   *
   * @param loggerId - Logger serial number
   * @param query - Optional date range (start, end as ISO strings)
   * @returns Array of measurement data points
   *
   * @example
   * GET /measurements/9250KHTU22BP0338
   * GET /measurements/9250KHTU22BP0338?start=2025-01-01T00:00:00Z&end=2025-01-02T00:00:00Z
   */
  @Get(':loggerId')
  async getMeasurements(
    @Param('loggerId') loggerId: string,
    @Query() query: MeasurementsQuery,
  ): Promise<MeasurementChartData[]> {
    this.logger.log(
      `GET /measurements/${loggerId} with query: ${JSON.stringify(query)}`,
    );

    // Parse date parameters
    let start: Date | undefined;
    let end: Date | undefined;

    if (query.start) {
      start = new Date(query.start);
      if (isNaN(start.getTime())) {
        throw new BadRequestException(`Invalid start date: ${query.start}`);
      }
    }

    if (query.end) {
      end = new Date(query.end);
      if (isNaN(end.getTime())) {
        throw new BadRequestException(`Invalid end date: ${query.end}`);
      }
    }

    const measurements = await this.measurementsService.getMeasurements(
      loggerId,
      start,
      end,
    );

    this.logger.log(`Returning ${measurements.length} measurements`);
    return measurements;
  }

  /**
   * Get list of all logger IDs in the database
   *
   * @example
   * GET /measurements/loggers
   */
  @Get()
  async getLoggerIds(): Promise<{ loggerIds: string[] }> {
    const loggerIds = await this.measurementsService.getLoggerIds();
    return { loggerIds };
  }
}
