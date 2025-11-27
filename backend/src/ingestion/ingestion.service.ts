import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Measurement } from '../database/entities/measurement.entity';
import { IParser, ParserError } from './interfaces/parser.interface';
import { GoodWeParser } from './strategies/goodwe.strategy';
import { LtiParser } from './strategies/lti.strategy';
import { IntegraParser } from './strategies/integra.strategy';
import { MbmetParser } from './strategies/mbmet.strategy';
import { MeierParser } from './strategies/meier.strategy';
import { MeteoControlParser } from './strategies/meteocontrol.strategy';
import { PlexlogParser } from './strategies/plexlog.strategy';
import { SmartdogParser } from './strategies/smartdog.strategy';
import { UnifiedMeasurementDTO } from './dto/unified-measurement.dto';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

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

  /** System files to skip during ingestion (macOS, Windows, etc.) */
  private readonly IGNORED_FILES = [
    '.DS_Store',
    'Thumbs.db',
    '.gitkeep',
    'desktop.ini',
    '.localized',
  ];

  constructor(
    @InjectRepository(Measurement)
    private readonly measurementRepository: Repository<Measurement>,
    private readonly goodWeParser: GoodWeParser,
    private readonly ltiParser: LtiParser,
    private readonly integraParser: IntegraParser,
    private readonly mbmetParser: MbmetParser,
    private readonly meierParser: MeierParser,
    private readonly meteoControlParser: MeteoControlParser,
    private readonly plexlogParser: PlexlogParser,
    private readonly smartdogParser: SmartdogParser,
  ) {
    // Register all available parsers (order matters - more specific parsers first)
    this.parsers = [
      this.plexlogParser, // Plexlog checks SQLite magic bytes - binary format, check first
      this.ltiParser, // LTI has specific [header]/[data] markers, check first
      this.integraParser, // Integra requires .xml extension + content signatures
      this.meteoControlParser, // Meteo Control has [info]/[messung]/[Start] INI sections
      this.mbmetParser, // MBMET has specific Zeitstempel/Einstrahlung headers
      this.meierParser, // Meier-NT has "serial;" metadata prefix
      this.smartdogParser, // SmartDog has B{}_A{}_S{} filename patterns
      this.goodWeParser, // GoodWe is a more general fallback
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

    // Skip system files (e.g., .DS_Store from macOS folder uploads)
    const basename = filename.split('/').pop() || filename;
    if (this.IGNORED_FILES.includes(basename) || basename.startsWith('.')) {
      this.logger.debug(`Skipping system file: ${filename}`);
      result.errors.push('System file skipped');
      result.durationMs = Date.now() - startTime;
      return result;
    }

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
          const measurement = this.dtoToEntity(dto, parser.name);
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
      const message = this.formatErrorMessage(error);
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
  private dtoToEntity(
    dto: UnifiedMeasurementDTO,
    parserName: string,
  ): Measurement {
    const measurement = new Measurement();
    measurement.timestamp = dto.timestamp;
    measurement.loggerId = dto.loggerId;
    measurement.loggerType = dto.loggerType || parserName;
    measurement.activePowerWatts = dto.activePowerWatts ?? null;
    measurement.energyDailyKwh = dto.energyDailyKwh ?? null;
    measurement.irradiance = dto.irradiance ?? null;
    measurement.metadata = dto.metadata ?? {};
    return measurement;
  }

  /**
   * Format error message from unknown error type
   */
  private formatErrorMessage(error: unknown): string {
    if (error instanceof ParserError) {
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Insert batch with upsert (ON CONFLICT DO UPDATE)
   * Composite PK ensures no duplicates, updates existing records
   */
  private async insertBatch(batch: Measurement[]): Promise<number> {
    if (batch.length === 0) return 0;

    try {
      // Convert to plain objects for TypeORM insert
      const values: QueryDeepPartialEntity<Measurement>[] = batch.map((m) => ({
        timestamp: m.timestamp,
        loggerId: m.loggerId,
        loggerType: m.loggerType,
        activePowerWatts: m.activePowerWatts,
        energyDailyKwh: m.energyDailyKwh,
        irradiance: m.irradiance,
        metadata: m.metadata as QueryDeepPartialEntity<Measurement>['metadata'],
      }));

      // Use upsert to handle duplicates gracefully
      // ON CONFLICT (loggerId, timestamp) DO UPDATE
      const result = await this.measurementRepository
        .createQueryBuilder()
        .insert()
        .into(Measurement)
        .values(values)
        .orUpdate(
          [
            'loggerType',
            'activePowerWatts',
            'energyDailyKwh',
            'irradiance',
            'metadata',
          ],
          ['loggerId', 'timestamp'],
        )
        .execute();

      return result.identifiers.length;
    } catch (error) {
      this.logger.error('Batch insert failed', {
        batchSize: batch.length,
        error: error instanceof Error ? error.message : String(error),
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
