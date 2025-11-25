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
   * Semantic translation map for metadata keys
   * Maps LTI abbreviations to canonical English names
   */
  private readonly TRANSLATION_MAP: Record<string, string> = {
    u_ac: 'voltageAC',
    i_ac: 'currentAC',
    u_dc: 'voltageDC',
    i_dc: 'currentDC',
    e_int: 'energyInterval',
    e_total: 'energyTotal',
    t_ch: 'temperatureChannel',
    t_tr: 'temperatureTransformer',
    t_hs: 'temperatureHeatsink',
    cos_phi: 'powerFactor',
    pc: 'powerCurtailment',
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
    await Promise.resolve();

    const lines = fileBuffer.toString('utf-8').split('\n');
    this.validateFileLength(lines);

    const context = {
      state: 'HEADER' as const,
      serial: null as string | null,
      headers: [] as string[],
    };
    let dataRowCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const result = this.processLine(line, i, context);
      if (result) {
        dataRowCount++;
        yield result;
      }
    }

    this.logger.log(`Parsed ${dataRowCount} data rows from LTI file`);
    this.validateDataRowCount(dataRowCount);
  }

  private validateFileLength(lines: string[]): void {
    if (lines.length < 2) {
      throw new ParserError(
        this.name,
        'File is empty or has insufficient data',
      );
    }
  }

  private validateDataRowCount(count: number): void {
    if (count === 0) {
      throw new ParserError(
        this.name,
        'No valid data rows found. Check file format.',
      );
    }
  }

  private processLine(
    line: string,
    lineNum: number,
    context: { state: string; serial: string | null; headers: string[] },
  ): UnifiedMeasurementDTO | null {
    if (context.state === 'HEADER') {
      return this.handleHeaderState(line, lineNum, context);
    }
    if (context.state === 'CSV_HEADER') {
      return this.handleCsvHeaderState(line, context);
    }
    return this.parseCsvDataRow(line, context.headers, context.serial, lineNum);
  }

  private handleHeaderState(
    line: string,
    lineNum: number,
    context: { state: string; serial: string | null },
  ): null {
    const result = this.processHeaderLine(line, lineNum);
    if (result.serial) context.serial = result.serial;
    if (result.transition) context.state = 'CSV_HEADER';
    return null;
  }

  private handleCsvHeaderState(
    line: string,
    context: { state: string; headers: string[] },
  ): null {
    context.headers = line.split(';').map((h) => h.trim().toLowerCase());
    this.logger.debug(`CSV headers: ${context.headers.join(', ')}`);
    context.state = 'CSV_DATA';
    return null;
  }

  /**
   * Process a line in HEADER state
   */
  private processHeaderLine(
    line: string,
    lineNum: number,
  ): { serial?: string; transition?: boolean } {
    if (line.toLowerCase() === '[data]') {
      this.logger.debug(`Found [data] marker at line ${lineNum + 1}`);
      return { transition: true };
    }

    const lowerLine = line.toLowerCase();
    if (lowerLine.startsWith('serial')) {
      const eqIndex = line.indexOf('=');
      if (eqIndex !== -1) {
        const serial = line.substring(eqIndex + 1).trim();
        this.logger.debug(`Extracted header serial: ${serial}`);
        return { serial };
      }
    }
    return {};
  }

  /**
   * Parse a CSV data row into a DTO
   */
  private parseCsvDataRow(
    line: string,
    csvHeaders: string[],
    headerSerial: string | null,
    lineNum: number,
  ): UnifiedMeasurementDTO | null {
    const values = line.split(';').map((v) => v.trim());

    if (values.length !== csvHeaders.length) {
      this.logger.warn(
        `Row ${lineNum + 1}: Column count mismatch (expected ${csvHeaders.length}, got ${values.length})`,
      );
      return null;
    }

    const row: Record<string, string> = {};
    for (let j = 0; j < csvHeaders.length; j++) {
      row[csvHeaders[j]] = values[j];
    }

    return this.transformRowToDTO(row, headerSerial);
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
      loggerType: 'lti',
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

    const cleaned = value.trim().replaceAll(/[,\s]/g, '');
    const num = Number.parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }

  /**
   * Normalize field name for metadata storage
   * Uses TRANSLATION_MAP for semantic English names
   * Converts "U_AC" -> "voltageAC", "Some Field" -> "someField"
   */
  private normalizeFieldName(name: string): string {
    const lowerName = name.trim().toLowerCase();

    // Check translation map for semantic English names
    for (const [pattern, translation] of Object.entries(this.TRANSLATION_MAP)) {
      if (
        lowerName === pattern ||
        lowerName.replaceAll('_', '') === pattern.replaceAll('_', '')
      ) {
        return translation;
      }
    }

    // Fallback to camelCase
    return lowerName
      .replaceAll(/[^a-z0-9\s_]/g, '')
      .replaceAll(/_([a-z])/g, (_, char: string) => char.toUpperCase())
      .replaceAll(/\s+(\S)/g, (_, char: string) => char.toUpperCase());
  }
}
