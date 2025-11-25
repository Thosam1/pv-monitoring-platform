import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'node:stream';
import csvParser from 'csv-parser';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * MBMET 501FB Meteo Station CSV Parser Strategy
 *
 * Handles CSV exports from MBMET 501FB meteo stations containing
 * irradiance and temperature data.
 *
 * File Structure:
 * - Row 1: Column headers (German: Zeitstempel, Einstrahlung, T_Zelle, T_Umgebung)
 * - Row 2: Units row (yyyy_MM_dd HH:mm:ss, W/m2, °C, °C) - SKIP
 * - Row 3+: Data rows
 *
 * Field Mapping (MBMET -> Unified):
 * - Zeitstempel -> timestamp (format: yyyy_MM_dd HH:mm:ss)
 * - Filename -> loggerId (extract digits after underscore)
 * - Einstrahlung (Einstrahlung West) -> irradiance (golden metric)
 * - All temperature and East fields -> metadata
 */
@Injectable()
export class MbmetParser implements IParser {
  private readonly logger = new Logger(MbmetParser.name);

  readonly name = 'mbmet';
  readonly description = 'MBMET 501FB Meteo Station CSV Export';

  private lastFilename = '';

  /**
   * Detect if this parser can handle the file
   *
   * Heuristics:
   * - Filename contains "mbmet" OR "einstrahlung" (case-insensitive)
   * - Content contains "Zeitstempel" AND "Einstrahlung"
   *
   * Side effect: Stores filename for loggerId extraction during parse()
   */
  canHandle(filename: string, snippet: string): boolean {
    const filenameMatch = /mbmet|einstrahlung/i.test(filename);
    const contentMatch =
      snippet.includes('Zeitstempel') && snippet.includes('Einstrahlung');
    const canHandle = filenameMatch || contentMatch;

    if (canHandle) {
      this.lastFilename = filename;
    }

    return canHandle;
  }

  /**
   * Parse MBMET CSV file
   *
   * Uses csv-parser for streaming, skips the units row
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    const loggerId = this.extractLoggerId(this.lastFilename);
    const rows: Record<string, string>[] = [];

    const stream = Readable.from(fileBuffer).pipe(
      csvParser({
        mapHeaders: ({ header }) => header.trim(),
      }),
    );

    for await (const row of stream) {
      rows.push(row as Record<string, string>);
    }

    if (rows.length === 0) {
      throw new ParserError(this.name, 'No data rows found in CSV file');
    }

    let dataRowCount = 0;
    for (const row of rows) {
      const dto = this.transformRowToDTO(row, loggerId);
      if (dto) {
        dataRowCount++;
        yield dto;
      }
    }

    this.logger.log(`Parsed ${dataRowCount} data rows from MBMET file`);

    if (dataRowCount === 0) {
      throw new ParserError(
        this.name,
        'No valid data rows found. Check file format.',
      );
    }
  }

  /**
   * Extract loggerId from filename
   * Pattern: einstrahlung_838176578.csv -> 838176578
   */
  private extractLoggerId(filename: string): string {
    const match = /_(\d+)\.csv$/i.exec(filename);
    if (match) {
      return match[1];
    }
    return 'MBMET_Unknown';
  }

  /**
   * Transform a CSV row to UnifiedMeasurementDTO
   */
  private transformRowToDTO(
    row: Record<string, string>,
    loggerId: string,
  ): UnifiedMeasurementDTO | null {
    // Get timestamp from Zeitstempel column
    const timestampValue = row['Zeitstempel'];
    if (!timestampValue) {
      this.logger.warn('Row missing Zeitstempel field');
      return null;
    }

    // Skip units row (starts with yyyy_MM_dd pattern description)
    if (timestampValue.startsWith('yyyy')) {
      return null;
    }

    const timestamp = this.parseTimestamp(timestampValue);
    if (!timestamp) {
      this.logger.warn(`Invalid timestamp: ${timestampValue}`);
      return null;
    }

    // Build DTO
    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId,
      loggerType: 'mbmet',
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {};

    // Map fields
    for (const [key, value] of Object.entries(row)) {
      if (key === 'Zeitstempel') continue;

      const numericValue = this.parseNumber(value);
      const normalizedKey = this.normalizeFieldName(key);

      // Map Einstrahlung West to irradiance golden metric
      // Use startsWith to avoid matching T_Zelle/T_Umgebung fields that have "(Einstrahlung West)" suffix
      if (key.startsWith('Einstrahlung') && key.includes('West')) {
        dto.irradiance = numericValue;
      } else {
        // Store all other fields in metadata
        metadata[normalizedKey] = numericValue;
      }
    }

    dto.metadata = metadata;
    return dto;
  }

  /**
   * Parse timestamp in format: yyyy_MM_dd HH:mm:ss
   * Converts underscores to dashes before parsing
   */
  private parseTimestamp(value: string): Date | null {
    if (!value || value.trim() === '') return null;

    // Replace underscores with dashes: 2025_09_30 -> 2025-09-30
    const normalized = value.trim().replaceAll('_', '-');

    // Try standard format: YYYY-MM-DD HH:mm:ss
    const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
      normalized,
    );
    if (match) {
      const year = Number.parseInt(match[1], 10);
      const month = Number.parseInt(match[2], 10) - 1;
      const day = Number.parseInt(match[3], 10);
      const hour = Number.parseInt(match[4], 10);
      const minute = Number.parseInt(match[5], 10);
      const second = Number.parseInt(match[6], 10);

      const date = new Date(Date.UTC(year, month, day, hour, minute, second));
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  /**
   * Parse string to number, handling empty/invalid values
   */
  private parseNumber(value: string): number | null {
    if (!value || value.trim() === '' || value === '-' || value === 'N/A') {
      return null;
    }

    const cleaned = value.trim().replaceAll(',', '.');
    const num = Number.parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Normalize field name for metadata storage
   * Converts "Einstrahlung (Einstrahlung Ost)" -> "einstrahlungOst"
   * Converts "T_Zelle (Einstrahlung West)" -> "tZelleWest"
   */
  private normalizeFieldName(name: string): string {
    // Extract orientation (West/Ost) if present
    const orientationMatch = /(West|Ost)\)?\s*$/i.exec(name);
    const orientation = orientationMatch ? orientationMatch[1] : '';

    // Extract base field name - remove parenthetical content without regex backtracking
    const parenIndex = name.indexOf('(');
    const baseName = (
      parenIndex >= 0 ? name.substring(0, parenIndex) : name
    ).trim();

    let camelCase: string;

    // Handle T_Zelle and T_Umgebung - preserve case after T_
    if (baseName.startsWith('T_')) {
      // T_Zelle -> tZelle, T_Umgebung -> tUmgebung
      camelCase = 't' + baseName.slice(2);
    } else {
      // Convert to camelCase without regex (avoids backtracking concerns)
      camelCase = this.toCamelCase(baseName);
    }

    // Append orientation
    if (orientation) {
      return (
        camelCase +
        orientation.charAt(0).toUpperCase() +
        orientation.slice(1).toLowerCase()
      );
    }

    return camelCase;
  }

  /**
   * Convert string to camelCase without regex (O(n) single pass)
   * Handles underscores and spaces as word separators
   */
  private toCamelCase(str: string): string {
    if (!str) return '';

    let result = '';
    let capitalizeNext = false;

    for (const char of str) {
      if (char === '_' || char === ' ' || char === '\t') {
        capitalizeNext = true;
        continue;
      }

      if (capitalizeNext) {
        result += char.toUpperCase();
        capitalizeNext = false;
      } else {
        result += char.toLowerCase();
      }
    }

    return result;
  }
}
