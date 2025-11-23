import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Measurement } from '../database/entities/measurement.entity';
import { IParser, ParserError } from './interfaces/parser.interface';
import { GoodWeParser } from './strategies/goodwe.strategy';
import { UnifiedMeasurementDTO } from './dto/unified-measurement.dto';

/**
 * Ingestion Result Summary
 */
export interface IngestionResult {
  success: boolean;
  filename: string;
  parserUsed: string;
  recordsProcessed: number;
  recordsInserted: number;
  recordsSkipped: number;
  errors: string[];
  durationMs: number;
}

/**
 * IngestionService - Orchestrates file parsing and database insertion
 *
 * Responsibilities:
 * 1. Parser Selection: Auto-detect appropriate parser based on file content
 * 2. Stream Processing: Memory-efficient processing via AsyncGenerator
 * 3. Batch Insertion: Bulk inserts for performance (configurable batch size)
 * 4. Error Handling: Graceful degradation, skip bad rows, report issues
 * 5. Deduplication: Composite PK naturally handles duplicates (upsert)
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  private readonly parsers: IParser[];
  private readonly BATCH_SIZE = 1000;

  constructor(
    @InjectRepository(Measurement)
    private readonly measurementRepository: Repository<Measurement>,
    private readonly goodWeParser: GoodWeParser,
  ) {
    // Register all available parsers
    this.parsers = [
      this.goodWeParser,
      // Add more parsers here: smaParser, froniusParser, etc.
    ];

    this.logger.log(
      `Initialized with ${this.parsers.length} parser(s): ${this.parsers.map((p) => p.name).join(', ')}`,
    );
  }

  /**
   * Ingest a file into the measurements table
   *
   * @param filename - Original filename for parser detection
   * @param fileBuffer - File content as Buffer
   * @returns IngestionResult with statistics
   */
  async ingestFile(
    filename: string,
    fileBuffer: Buffer,
  ): Promise<IngestionResult> {
    const startTime = Date.now();
    const result: IngestionResult = {
      success: false,
      filename,
      parserUsed: 'none',
      recordsProcessed: 0,
      recordsInserted: 0,
      recordsSkipped: 0,
      errors: [],
      durationMs: 0,
    };

    try {
      // Get file snippet for parser detection
      const snippet = fileBuffer.toString('utf-8', 0, 2048);

      // Find appropriate parser
      const parser = this.findParser(filename, snippet);
      if (!parser) {
        throw new Error(
          `No parser found for file: ${filename}. Supported formats: ${this.parsers.map((p) => p.name).join(', ')}`,
        );
      }

      result.parserUsed = parser.name;
      this.logger.log(`Using parser '${parser.name}' for file: ${filename}`);

      // Process records in batches
      const batch: Measurement[] = [];

      for await (const dto of parser.parse(fileBuffer)) {
        result.recordsProcessed++;

        try {
          const measurement = this.dtoToEntity(dto);
          batch.push(measurement);

          // Flush batch when full
          if (batch.length >= this.BATCH_SIZE) {
            const inserted = await this.insertBatch(batch);
            result.recordsInserted += inserted;
            batch.length = 0; // Clear batch
          }
        } catch (error) {
          result.recordsSkipped++;
          result.errors.push(
            `Record ${result.recordsProcessed}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Flush remaining records
      if (batch.length > 0) {
        const inserted = await this.insertBatch(batch);
        result.recordsInserted += inserted;
      }

      result.success = result.recordsInserted > 0;
      this.logger.log(
        `Ingestion complete: ${result.recordsInserted}/${result.recordsProcessed} records inserted`,
      );
    } catch (error) {
      const message =
        error instanceof ParserError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);

      result.errors.push(message);
      this.logger.error(`Ingestion failed for ${filename}: ${message}`);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Find a parser that can handle the given file
   */
  private findParser(filename: string, snippet: string): IParser | null {
    for (const parser of this.parsers) {
      if (parser.canHandle(filename, snippet)) {
        return parser;
      }
    }
    return null;
  }

  /**
   * Convert DTO to Entity
   */
  private dtoToEntity(dto: UnifiedMeasurementDTO): Measurement {
    const measurement = new Measurement();
    measurement.timestamp = dto.timestamp;
    measurement.loggerId = dto.loggerId;
    measurement.activePowerWatts = dto.activePowerWatts ?? null;
    measurement.energyDailyKwh = dto.energyDailyKwh ?? null;
    measurement.irradiance = dto.irradiance ?? null;
    measurement.metadata = dto.metadata ?? {};
    return measurement;
  }

  /**
   * Insert batch with upsert (ON CONFLICT DO UPDATE)
   * Composite PK ensures no duplicates, updates existing records
   */
  private async insertBatch(batch: Measurement[]): Promise<number> {
    if (batch.length === 0) return 0;

    try {
      // Convert to plain objects for TypeORM insert
      const values = batch.map((m) => ({
        timestamp: m.timestamp,
        loggerId: m.loggerId,
        activePowerWatts: m.activePowerWatts,
        energyDailyKwh: m.energyDailyKwh,
        irradiance: m.irradiance,
        metadata: m.metadata,
      }));

      // Use upsert to handle duplicates gracefully
      // ON CONFLICT (loggerId, timestamp) DO UPDATE
      const result = await this.measurementRepository
        .createQueryBuilder()
        .insert()
        .into(Measurement)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .values(values as any)
        .orUpdate(
          ['activePowerWatts', 'energyDailyKwh', 'irradiance', 'metadata'],
          ['loggerId', 'timestamp'],
        )
        .execute();

      return result.identifiers.length;
    } catch (error) {
      this.logger.error('Batch insert failed', {
        batchSize: batch.length,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get list of supported parsers
   */
  getSupportedParsers(): { name: string; description: string }[] {
    return this.parsers.map((p) => ({
      name: p.name,
      description: p.description,
    }));
  }
}
