import { Injectable, Logger } from '@nestjs/common';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * LTI ReEnergy Data Parser Strategy
 *
 * Handles "Sectioned CSV" exports from LTI ReEnergy inverters.
 *
 * File Structure:
 * - Lines 1-5: Metadata header (key=value pairs, e.g., "serial=090250014")
 * - Line 6: [data] marker
 * - Line 7: CSV Header (semicolon-delimited)
 * - Line 8+: CSV Data rows (semicolon-delimited)
 *
 * Field Mapping (LTI -> Unified):
 * - timestamp -> timestamp (format: YYYY-MM-DD HH:mm:ss)
 * - serial (column or header) -> loggerId
 * - P_AC -> activePowerWatts
 * - E_DAY -> energyDailyKwh
 * - All others -> metadata
 */
@Injectable()
export class LtiParser implements IParser {
  private readonly logger = new Logger(LtiParser.name);

  readonly name = 'lti';
  readonly description = 'LTI ReEnergy Sectioned CSV Export';

  /**
   * Field mapping for golden metrics
   */
  private readonly fieldMappings: Record<
    string,
    keyof Pick<
      UnifiedMeasurementDTO,
      'activePowerWatts' | 'energyDailyKwh' | 'irradiance'
    >
  > = {
    p_ac: 'activePowerWatts',
    pac: 'activePowerWatts',
    active_power: 'activePowerWatts',
    activepower: 'activePowerWatts',
    e_day: 'energyDailyKwh',
    eday: 'energyDailyKwh',
    daily_yield: 'energyDailyKwh',
    dailyyield: 'energyDailyKwh',
    irradiance: 'irradiance',
  };

  /**
   * Detect if this parser can handle the file
   *
   * Heuristics:
   * - Filename contains "LTi" (case-insensitive)
   * - Content contains "[header]" or "[data]" markers
   */
  canHandle(filename: string, snippet: string): boolean {
    const filenameMatch = /lti/i.test(filename);
    const contentMatch =
      snippet.includes('[header]') || snippet.includes('[data]');
    return filenameMatch || contentMatch;
  }

  /**
   * Parse LTI sectioned CSV file
   *
   * Uses a state machine:
   * - State A (HEADER): Read lines until [data], extract metadata
   * - State B (CSV): Parse semicolon-delimited CSV
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    // Ensure this is an async generator (required by interface)
    await Promise.resolve();

    const content = fileBuffer.toString('utf-8');
    const lines = content.split('\n');

    if (lines.length < 2) {
      throw new ParserError(
        this.name,
        'File is empty or has insufficient data',
      );
    }

    // State machine variables
    let state: 'HEADER' | 'CSV_HEADER' | 'CSV_DATA' = 'HEADER';
    let headerSerial: string | null = null;
    let csvHeaders: string[] = [];
    let dataRowCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip empty lines
      if (!line) continue;

      switch (state) {
        case 'HEADER': {
          // Check for [data] marker to transition to CSV parsing
          if (line.toLowerCase() === '[data]') {
            state = 'CSV_HEADER';
            this.logger.debug(`Found [data] marker at line ${i + 1}`);
            continue;
          }

          // Extract serial from header metadata (format: key=value)
          const serialMatch = /^serial\s*=\s*(.+)$/i.exec(line);
          if (serialMatch) {
            headerSerial = serialMatch[1].trim();
            this.logger.debug(`Extracted header serial: ${headerSerial}`);
          }
          break;
        }

        case 'CSV_HEADER': {
          // This line is the CSV header row
          csvHeaders = line.split(';').map((h) => h.trim().toLowerCase());
          this.logger.debug(`CSV headers: ${csvHeaders.join(', ')}`);
          state = 'CSV_DATA';
          break;
        }

        case 'CSV_DATA': {
          // Parse data row
          const values = line.split(';').map((v) => v.trim());

          if (values.length !== csvHeaders.length) {
            this.logger.warn(
              `Row ${i + 1}: Column count mismatch (expected ${csvHeaders.length}, got ${values.length})`,
            );
            continue;
          }

          // Build row object
          const row: Record<string, string> = {};
          for (let j = 0; j < csvHeaders.length; j++) {
            row[csvHeaders[j]] = values[j];
          }

          // Transform to DTO
          const dto = this.transformRowToDTO(row, headerSerial);
          if (dto) {
            dataRowCount++;
            yield dto;
          }
          break;
        }
      }
    }

    this.logger.log(`Parsed ${dataRowCount} data rows from LTI file`);

    if (dataRowCount === 0) {
      throw new ParserError(
        this.name,
        'No valid data rows found. Check file format.',
      );
    }
  }

  /**
   * Transform a CSV row to UnifiedMeasurementDTO
   */
  private transformRowToDTO(
    row: Record<string, string>,
    headerSerial: string | null,
  ): UnifiedMeasurementDTO | null {
    // Extract timestamp
    const timestampValue =
      row['timestamp'] || row['time'] || row['datetime'] || row['date_time'];
    if (!timestampValue) {
      this.logger.warn('Row missing timestamp field');
      return null;
    }

    const timestamp = this.parseTimestamp(timestampValue);
    if (!timestamp) {
      this.logger.warn(`Invalid timestamp: ${timestampValue}`);
      return null;
    }

    // Extract loggerId: prefer column value, fallback to header metadata
    const loggerId =
      row['serial'] ||
      row['serial_number'] ||
      row['address'] ||
      row['device_id'] ||
      headerSerial ||
      'unknown';

    // Build DTO
    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId,
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {};
    const processedFields = new Set([
      'timestamp',
      'time',
      'datetime',
      'date_time',
      'serial',
      'serial_number',
      'address',
      'device_id',
    ]);

    // Map fields
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().trim();

      if (processedFields.has(normalizedKey)) continue;

      // Check for golden metric mapping
      const goldenField = this.fieldMappings[normalizedKey];
      if (goldenField) {
        const numericValue = this.parseNumber(value);
        if (numericValue !== null && dto[goldenField] === null) {
          dto[goldenField] = numericValue;
        }
        processedFields.add(normalizedKey);
      } else {
        // Store in metadata
        const parsedValue = this.parseNumber(value);
        metadata[this.normalizeFieldName(key)] = parsedValue ?? value;
      }
    }

    dto.metadata = metadata;
    return dto;
  }

  /**
   * Parse timestamp in format: YYYY-MM-DD HH:mm:ss
   */
  private parseTimestamp(value: string): Date | null {
    if (!value || value.trim() === '') return null;

    const trimmed = value.trim();

    // Try standard format: YYYY-MM-DD HH:mm:ss
    const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
      trimmed,
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

    // Try ISO format as fallback
    const isoDate = new Date(trimmed);
    if (!Number.isNaN(isoDate.getTime())) {
      return isoDate;
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

    const cleaned = value.trim().replace(/[,\s]/g, '');
    const num = Number.parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Normalize field name for metadata storage
   * Converts "P_AC" -> "pAc", "Some Field" -> "someField"
   */
  private normalizeFieldName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9\s_]/g, '')
      .replaceAll(/_([a-z])/g, (_, char: string) => char.toUpperCase())
      .replaceAll(/\s+([a-z])/g, (_, char: string) => char.toUpperCase());
  }
}
