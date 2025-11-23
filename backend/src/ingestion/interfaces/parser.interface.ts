import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * IParser Interface - Strategy Pattern for File Parsing
 *
 * This interface defines the contract for all data source parsers.
 * Each inverter/logger brand (GoodWe, SMA, Fronius, etc.) implements
 * this interface to transform their proprietary format into the
 * unified measurement schema.
 *
 * Design Principles:
 * 1. MEMORY EFFICIENT: Uses AsyncGenerator to stream records, avoiding
 *    loading entire files into memory (critical for large CSV files).
 * 2. SELF-IDENTIFYING: Each parser can detect if it can handle a file
 *    via `canHandle()`, enabling automatic parser selection.
 * 3. EXTENSIBLE: New data sources added by implementing this interface,
 *    no changes to core ingestion logic required.
 *
 * Usage:
 * ```typescript
 * const parser = parsers.find(p => p.canHandle(filename, snippet));
 * if (parser) {
 *   for await (const measurement of parser.parse(buffer)) {
 *     await repository.save(measurement);
 *   }
 * }
 * ```
 */
export interface IParser {
  /**
   * Unique identifier for this parser.
   * Used for logging, metrics, and configuration.
   * Examples: 'goodwe', 'sma-sunny-portal', 'fronius-datamanager'
   */
  readonly name: string;

  /**
   * Human-readable description of the data source.
   * Examples: 'GoodWe SEMS Portal CSV Export', 'SMA Sunny Portal Data'
   */
  readonly description: string;

  /**
   * Determine if this parser can handle the given file.
   *
   * Implementation should be fast and non-destructive - typically
   * checking filename patterns and/or inspecting the first few lines
   * of the file content.
   *
   * @param filename - Original filename (e.g., 'GW12345_2024-01-15.csv')
   * @param snippet - First 1-2KB of file content for header inspection
   * @returns true if this parser can process the file
   *
   * @example
   * // GoodWe parser might check for:
   * canHandle(filename, snippet) {
   *   return filename.toLowerCase().includes('goodwe') ||
   *          snippet.includes('SEMS Portal') ||
   *          snippet.includes('Active_Power');
   * }
   */
  canHandle(filename: string, snippet: string): boolean;

  /**
   * Parse the file buffer and yield unified measurement records.
   *
   * Implementation notes:
   * - Use AsyncGenerator for memory-efficient streaming
   * - Handle encoding issues (UTF-8, UTF-16, etc.)
   * - Skip malformed rows with warnings, don't fail entire file
   * - Normalize timestamps to UTC
   * - Map known fields to golden metrics, rest to metadata
   *
   * @param fileBuffer - Complete file content as Buffer
   * @yields UnifiedMeasurementDTO for each valid measurement record
   * @throws ParserError if file is fundamentally unparseable
   *
   * @example
   * async *parse(fileBuffer: Buffer) {
   *   const stream = Readable.from(fileBuffer).pipe(csvParser());
   *   for await (const row of stream) {
   *     yield this.transformRow(row);
   *   }
   * }
   */
  parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO>;
}

/**
 * Parser metadata for registration and discovery.
 */
export interface ParserMetadata {
  /** Parser identifier */
  name: string;
  /** Supported file extensions */
  extensions: string[];
  /** Priority for parser selection (higher = preferred) */
  priority: number;
}

/**
 * Custom error for parser-specific failures.
 */
export class ParserError extends Error {
  constructor(
    public readonly parserName: string,
    message: string,
    public readonly originalError?: Error,
  ) {
    super(`[${parserName}] ${message}`);
    this.name = 'ParserError';
  }
}
