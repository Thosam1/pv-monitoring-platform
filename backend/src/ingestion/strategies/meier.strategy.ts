import { Injectable, Logger } from '@nestjs/common';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * Meier-NT Logger CSV Parser Strategy
 *
 * Handles CSV exports from Meier-NT data loggers.
 *
 * File Structure:
 * - Line 1: serial; 080000891 (loggerId)
 * - Line 2: usermail; ...
 * - Line 3: description; ...
 * - Line 4: Headers (; GENERAL.Feed-In_Power; GENERAL.Yield; ...)
 * - Line 5: Units (; W; Wh; ...)
 * - Line 6+: Data rows (01.10.2025 01:50:00; 0; 0; ...)
 *
 * Field Mapping (Meier -> Unified):
 * - Column 0 (timestamp) -> timestamp (format: dd.MM.yyyy HH:mm:ss)
 * - serial value -> loggerId
 * - GENERAL.Feed-In_Power (W) -> activePowerWatts
 * - GENERAL.Yield (Wh) -> energyDailyKwh (÷ 1000)
 * - All other fields -> metadata
 */
@Injectable()
export class MeierParser implements IParser {
  private readonly logger = new Logger(MeierParser.name);

  readonly name = 'meier';
  readonly description = 'Meier-NT Logger CSV Export';

  /**
   * Field mappings for golden metrics
   * Map column header -> { field, conversionFactor }
   */
  private readonly fieldMappings: Record<
    string,
    {
      field: 'activePowerWatts' | 'energyDailyKwh' | 'irradiance';
      factor: number;
    }
  > = {
    'general.feed-in_power': { field: 'activePowerWatts', factor: 1 },
    'general.yield': { field: 'energyDailyKwh', factor: 0.001 }, // Wh -> kWh
  };

  /**
   * Detect if this parser can handle the file
   *
   * Heuristics:
   * - Filename contains "meier" (case-insensitive)
   * - Content starts with "serial;" (metadata line 1)
   */
  canHandle(filename: string, snippet: string): boolean {
    const filenameMatch = /meier/i.test(filename);
    const contentMatch = /^serial;/i.test(snippet.trim());
    return filenameMatch || contentMatch;
  }

  /**
   * Parse Meier-NT CSV file
   *
   * Manual line-by-line parsing due to metadata in lines 1-3
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    // Yield control to event loop for large files
    await Promise.resolve();

    const content = fileBuffer.toString('utf-8');
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

    if (lines.length === 0) {
      throw new ParserError(this.name, 'File is empty');
    }

    // Extract serial from line 1: "serial; 080000891"
    const loggerId = this.extractSerial(lines[0]);

    // Line 4 (index 3): Headers
    if (lines.length < 4) {
      throw new ParserError(this.name, 'File missing header row (line 4)');
    }
    const headers = this.parseHeaders(lines[3]);

    // Line 5 (index 4): Units - skip but validate existence
    if (lines.length < 5) {
      throw new ParserError(this.name, 'File missing units row (line 5)');
    }

    // Line 6+ (index 5+): Data rows
    if (lines.length < 6) {
      throw new ParserError(this.name, 'No data rows found');
    }

    let dataRowCount = 0;
    for (let i = 5; i < lines.length; i++) {
      const dto = this.transformRowToDTO(lines[i], headers, loggerId);
      if (dto) {
        dataRowCount++;
        yield dto;
      }
    }

    this.logger.log(`Parsed ${dataRowCount} data rows from Meier-NT file`);

    if (dataRowCount === 0) {
      throw new ParserError(
        this.name,
        'No valid data rows found. Check file format.',
      );
    }
  }

  /**
   * Extract serial number from line 1
   * Format: "serial; 080000891" -> "080000891"
   */
  private extractSerial(line: string): string {
    const parts = line.split(';');
    if (parts.length >= 2 && parts[0].trim().toLowerCase() === 'serial') {
      return parts[1].trim();
    }
    this.logger.warn('Could not extract serial from first line, using default');
    return 'MEIER_Unknown';
  }

  /**
   * Parse headers from line 4
   * Format: "; GENERAL.Feed-In_Power; GENERAL.Yield; ..."
   * First column (empty) represents timestamp
   */
  private parseHeaders(line: string): string[] {
    return line.split(';').map((h, index) => {
      const trimmed = h.trim();
      // First column is timestamp (header is empty)
      if (index === 0 && trimmed === '') {
        return 'timestamp';
      }
      return trimmed;
    });
  }

  /**
   * Transform a data row to UnifiedMeasurementDTO
   */
  private transformRowToDTO(
    line: string,
    headers: string[],
    loggerId: string,
  ): UnifiedMeasurementDTO | null {
    const values = line.split(';').map((v) => v.trim());

    if (values.length === 0) {
      return null;
    }

    // Parse timestamp from first column
    const timestamp = this.parseTimestamp(values[0]);
    if (!timestamp) {
      this.logger.warn(`Invalid timestamp: ${values[0]}`);
      return null;
    }

    // Build DTO
    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId,
      loggerType: 'meier',
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {};

    // Map values to headers
    for (let i = 1; i < headers.length && i < values.length; i++) {
      const header = headers[i];
      const numericValue = this.parseNumber(values[i]);
      const normalizedHeader = header.toLowerCase();

      // Check for golden metric mapping
      const mapping = this.fieldMappings[normalizedHeader];
      if (mapping) {
        if (numericValue !== null) {
          dto[mapping.field] = numericValue * mapping.factor;
        }
      } else {
        // Store in metadata with normalized key
        const metaKey = this.normalizeFieldName(header);
        metadata[metaKey] = numericValue;
      }
    }

    dto.metadata = metadata;
    return dto;
  }

  /**
   * Parse timestamp in German format: dd.MM.yyyy HH:mm:ss
   * "01.10.2025 01:50:00" -> October 1st, 2025 (NOT January 10th)
   */
  private parseTimestamp(value: string): Date | null {
    if (!value || value.trim() === '') return null;

    const match = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
      value.trim(),
    );
    if (!match) return null;

    const day = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10) - 1; // JS months are 0-indexed
    const year = Number.parseInt(match[3], 10);
    const hour = Number.parseInt(match[4], 10);
    const minute = Number.parseInt(match[5], 10);
    const second = Number.parseInt(match[6], 10);

    // Validate date components
    if (day < 1 || day > 31) return null;
    if (month < 0 || month > 11) return null;
    if (hour < 0 || hour > 23) return null;
    if (minute < 0 || minute > 59) return null;
    if (second < 0 || second > 59) return null;

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  /**
   * Parse string to number, handling empty/invalid values
   */
  private parseNumber(value: string): number | null {
    if (!value || value.trim() === '' || value === '-' || value === 'N/A') {
      return null;
    }

    // Handle comma as decimal separator (German format)
    const cleaned = value.trim().replaceAll(',', '.');
    const num = Number.parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Normalize field name for metadata storage
   * "GENERAL.Feed-In_Power" -> "generalFeedInPower"
   * "Kostal.1.2.Yield" -> "kostal12Yield"
   */
  private normalizeFieldName(name: string): string {
    if (!name) return '';

    // Remove dots and underscores, convert to camelCase
    const parts = name.split(/[._-]+/);
    return parts
      .map((part, index) => {
        const lower = part.toLowerCase();
        if (index === 0) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join('');
  }
}
