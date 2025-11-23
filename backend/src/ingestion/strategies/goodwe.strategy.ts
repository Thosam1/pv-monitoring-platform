import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import csvParser from 'csv-parser';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * GoodWe Data Parser Strategy
 *
 * Handles CSV exports from GoodWe SEMS Portal and local data loggers.
 *
 * GoodWe CSV Characteristics:
 * - Often uses EAV (Entity-Attribute-Value) format within the file
 * - Multiple rows per timestamp (one per metric)
 * - Headers may include: Time, Parameter, Value, Unit
 * - Or columnar format with all metrics as columns
 * - Timestamps typically in local time (needs UTC conversion)
 *
 * This parser handles both formats:
 * 1. EAV Format: Groups rows by timestamp, pivots to single record
 * 2. Columnar Format: Direct mapping with field normalization
 *
 * Field Mapping (GoodWe -> Unified):
 * - Active_Power, Pac, Output_Power -> activePowerWatts
 * - E_Day, Today_Energy, Daily_Generation -> energyDailyKwh
 * - Irradiance, Solar_Irradiance -> irradiance
 * - All others -> metadata
 */
@Injectable()
export class GoodWeParser implements IParser {
  private readonly logger = new Logger(GoodWeParser.name);

  readonly name = 'goodwe';
  readonly description = 'GoodWe SEMS Portal CSV Export';

  /**
   * GoodWe file detection patterns
   */
  private readonly filenamePatterns = [
    /goodwe/i,
    /sems/i,
    /gw\d{8,}/i, // GW + 8+ digit serial
  ];

  private readonly headerPatterns = [
    'SEMS Portal',
    'GoodWe',
    'Active_Power',
    'Pac(W)',
    'E_Day',
    'Today_Energy',
  ];

  /**
   * Field mapping configuration
   * Maps various GoodWe field names to unified schema fields
   * Keys should be normalized (lowercase, trimmed)
   */
  private readonly fieldMappings: Record<
    string,
    keyof Pick<
      UnifiedMeasurementDTO,
      'activePowerWatts' | 'energyDailyKwh' | 'irradiance'
    >
  > = {
    // Active Power variations (exact matches after normalization)
    active_power: 'activePowerWatts',
    activepower: 'activePowerWatts',
    'active_power percent': 'activePowerWatts',
    'activepower percent': 'activePowerWatts',
    'pac(w)': 'activePowerWatts',
    pac: 'activePowerWatts',
    output_power: 'activePowerWatts',
    outputpower: 'activePowerWatts',
    power: 'activePowerWatts',
    'ac power': 'activePowerWatts',
    acpower: 'activePowerWatts',
    'power(w)': 'activePowerWatts',
    'ac_power': 'activePowerWatts',

    // Daily Energy variations
    e_day: 'energyDailyKwh',
    eday: 'energyDailyKwh',
    'e-day': 'energyDailyKwh',
    today_energy: 'energyDailyKwh',
    todayenergy: 'energyDailyKwh',
    daily_generation: 'energyDailyKwh',
    dailygeneration: 'energyDailyKwh',
    'daily energy': 'energyDailyKwh',
    dailyenergy: 'energyDailyKwh',
    'energy today': 'energyDailyKwh',
    energytoday: 'energyDailyKwh',
    'eday(kwh)': 'energyDailyKwh',
    e_total: 'energyDailyKwh',
    etotal: 'energyDailyKwh',

    // Irradiance variations
    irradiance: 'irradiance',
    solar_irradiance: 'irradiance',
    solarirradiance: 'irradiance',
    'irradiance(w/m2)': 'irradiance',
    poa_irradiance: 'irradiance',
    poairradiance: 'irradiance',
  };

  /**
   * Timestamp field detection
   */
  private readonly timestampFields = [
    'time',
    'timestamp',
    'date_time',
    'datetime',
    'date',
    'measurement_time',
  ];

  /**
   * Logger ID field detection
   */
  private readonly loggerIdFields = [
    'serial',
    'serial_number',
    'sn',
    'logger_id',
    'inverter_id',
    'device_id',
    'station_id',
  ];

  canHandle(filename: string, snippet: string): boolean {
    // Check filename patterns
    const filenameMatch = this.filenamePatterns.some((pattern) =>
      pattern.test(filename),
    );

    // Check content patterns
    const contentMatch = this.headerPatterns.some((pattern) =>
      snippet.toLowerCase().includes(pattern.toLowerCase()),
    );

    return filenameMatch || contentMatch;
  }

  /**
   * Parse GoodWe CSV file (headerless EAV format)
   *
   * Expected CSV structure (no headers):
   * Column 0: Timestamp (YYYYMMDD"T"HHmmss format, e.g., "20251001T020435")
   * Column 1: LoggerId (serial number)
   * Column 2: Key (metric name like "Pac", "E_Day", etc.)
   * Column 3: Value
   *
   * Multiple rows per timestamp are grouped into a single measurement record.
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    const content = fileBuffer.toString('utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    if (lines.length < 1) {
      throw new ParserError(this.name, 'File is empty or has no data rows');
    }

    // Parse headerless CSV with index-based column access
    yield* this.parseHeaderlessEAV(fileBuffer);
  }

  /**
   * Parse headerless EAV (Entity-Attribute-Value) format
   *
   * CSV columns by index:
   * - '0': Timestamp
   * - '1': LoggerId
   * - '2': Key (metric name)
   * - '3': Value
   */
  private async *parseHeaderlessEAV(
    fileBuffer: Buffer,
  ): AsyncGenerator<UnifiedMeasurementDTO> {
    const rows: Record<string, string>[] = [];

    // Configure csv-parser for headerless CSV
    const stream = Readable.from(fileBuffer).pipe(
      csvParser({
        headers: false,
        separator: ',',
      }),
    );

    let rowCount = 0;

    for await (const row of stream) {
      // Debug: Log first row structure to understand the data
      if (rowCount === 0) {
        this.logger.debug('First Row Structure:', JSON.stringify(row));
      }
      rows.push(row as Record<string, string>);
      rowCount++;
    }

    this.logger.log(`Read ${rowCount} rows from CSV`);

    // Group by timestamp + loggerId
    const groups = new Map<string, Map<string, unknown>>();
    let skippedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Extract values by index, with trimming
      const rawTimestamp = this.safeGetAndTrim(row, '0');
      const rawLoggerId = this.safeGetAndTrim(row, '1');
      const rawKey = this.safeGetAndTrim(row, '2');
      const rawValue = this.safeGetAndTrim(row, '3');

      // Parse timestamp
      const timestamp = this.parseTimestamp(rawTimestamp);
      if (!timestamp) {
        skippedCount++;
        if (i < 5) {
          // Log first few failures for debugging
          this.logger.warn(
            `Row ${i + 1}: No valid timestamp found. Raw value: "${rawTimestamp}"`,
          );
        }
        continue;
      }

      // Extract loggerId
      const loggerId = rawLoggerId || 'unknown';

      // Create group key
      const groupKey = `${timestamp.toISOString()}|${loggerId}`;
      if (!groups.has(groupKey)) {
        const groupMap = new Map<string, unknown>();
        groupMap.set('timestamp', timestamp);
        groupMap.set('loggerId', loggerId);
        groups.set(groupKey, groupMap);
      }

      const group = groups.get(groupKey)!;

      // Store metric: key -> value
      if (rawKey) {
        const normalizedKey = rawKey.toLowerCase().trim();
        const numericValue = this.parseNumber(rawValue);
        group.set(normalizedKey, numericValue);
      }
    }

    this.logger.log(
      `Grouped into ${groups.size} measurements (${skippedCount} rows skipped)`,
    );

    // Yield unified records
    for (const group of groups.values()) {
      yield this.transformToDTO(Object.fromEntries(group));
    }
  }

  /**
   * Safely get a value from row by key and trim whitespace
   */
  private safeGetAndTrim(
    row: Record<string, string>,
    key: string,
  ): string {
    const value = row[key];
    if (value === undefined || value === null) {
      return '';
    }
    return String(value).trim();
  }

  /**
   * Parse various timestamp formats to UTC Date
   */
  private parseTimestamp(value: string): Date | null {
    if (!value || value.trim() === '') return null;

    const trimmed = value.trim();

    // Try GoodWe compact format first: YYYYMMDD"T"HHmmss (e.g., "20251001T020435")
    const goodWeCompact = this.parseGoodWeCompactDate(trimmed);
    if (goodWeCompact) {
      return goodWeCompact;
    }

    // Try ISO format
    let date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      return date;
    }

    // Try common GoodWe formats: "2024-01-15 14:30:00", "15/01/2024 14:30"
    const formats = [
      /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):?(\d{2})?$/, // 2024-01-15 14:30:00
      /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?$/, // 15/01/2024 14:30
      /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):?(\d{2})?$/, // 15-01-2024 14:30
    ];

    for (const format of formats) {
      const match = trimmed.match(format);
      if (match) {
        // Determine year, month, day positions based on format
        let year: number, month: number, day: number;
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        const second = match[6] ? parseInt(match[6], 10) : 0;

        if (match[1].length === 4) {
          // Year first: YYYY-MM-DD
          year = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          day = parseInt(match[3], 10);
        } else {
          // Day first: DD/MM/YYYY or DD-MM-YYYY
          day = parseInt(match[1], 10);
          month = parseInt(match[2], 10) - 1;
          year = parseInt(match[3], 10);
        }

        date = new Date(Date.UTC(year, month, day, hour, minute, second));
        if (!isNaN(date.getTime())) {
          return date;
        }
      }
    }

    return null;
  }

  /**
   * Parse GoodWe compact date format: YYYYMMDD"T"HHmmss
   * Example: "20251001T020435" -> 2025-10-01T02:04:35Z
   *
   * This non-standard format is used by some GoodWe exports.
   * Standard new Date() fails on this format.
   *
   * @param raw - Raw timestamp string
   * @returns Parsed Date in UTC, or null if invalid
   */
  private parseGoodWeCompactDate(raw: string): Date | null {
    // Match format: YYYYMMDDTHHmmss (15 chars with T separator)
    const match = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (!match) {
      return null;
    }

    const year = parseInt(match[1], 10);   // chars 0-3
    const month = parseInt(match[2], 10);  // chars 4-5
    const day = parseInt(match[3], 10);    // chars 6-7
    const hour = parseInt(match[4], 10);   // chars 9-10 (after T)
    const minute = parseInt(match[5], 10); // chars 11-12
    const second = parseInt(match[6], 10); // chars 13-14

    // Validate ranges
    if (
      month < 1 || month > 12 ||
      day < 1 || day > 31 ||
      hour < 0 || hour > 23 ||
      minute < 0 || minute > 59 ||
      second < 0 || second > 59
    ) {
      return null;
    }

    // Create UTC date (month is 0-indexed in JS)
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    // Final validation
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /**
   * Extract logger ID from row, with fallback to 'unknown'
   * Supports both named columns and index-based access (headerless CSV)
   */
  private extractLoggerId(row: Record<string, unknown>): string {
    // Try index-based access first (headerless CSV)
    const indexValue = row['1'];
    if (indexValue && String(indexValue).trim()) {
      return String(indexValue).trim();
    }

    // Fall back to named column access
    for (const field of this.loggerIdFields) {
      const value = row[field];
      if (value && String(value).trim()) {
        return String(value).trim();
      }
    }
    return 'unknown';
  }

  /**
   * Transform raw row data to UnifiedMeasurementDTO
   */
  private transformToDTO(row: Record<string, unknown>): UnifiedMeasurementDTO {
    const dto: UnifiedMeasurementDTO = {
      timestamp: row['timestamp'] as Date,
      loggerId: (row['loggerId'] as string) || 'unknown',
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {};
    const mappedFields = new Set<string>(['timestamp', 'loggerid']);

    // Map fields to golden metrics or metadata
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().trim();

      // Skip already processed fields
      if (
        mappedFields.has(normalizedKey) ||
        this.timestampFields.includes(normalizedKey) ||
        this.loggerIdFields.includes(normalizedKey)
      ) {
        continue;
      }

      // Check if this maps to a golden metric (try multiple normalizations)
      const goldenField = this.findGoldenMetricMapping(normalizedKey);
      if (goldenField) {
        const numericValue = this.parseNumber(value);
        if (numericValue !== null && dto[goldenField] === null) {
          // Only set if not already set (first match wins)
          dto[goldenField] = numericValue;
        }
        mappedFields.add(normalizedKey);
      } else {
        // Store in metadata
        const parsedValue = this.parseNumber(value);
        metadata[this.normalizeFieldName(key)] =
          parsedValue !== null ? parsedValue : value;
      }
    }

    dto.metadata = metadata;
    return dto;
  }

  /**
   * Find golden metric mapping by trying multiple key normalizations
   * This handles variations like "Active_power percent", "activepower", etc.
   */
  private findGoldenMetricMapping(
    key: string,
  ): keyof Pick<UnifiedMeasurementDTO, 'activePowerWatts' | 'energyDailyKwh' | 'irradiance'> | null {
    const normalizedKey = key.toLowerCase().trim();

    // Try exact match first
    if (this.fieldMappings[normalizedKey]) {
      return this.fieldMappings[normalizedKey];
    }

    // Try removing underscores and spaces (e.g., "active_power" -> "activepower")
    const noUnderscores = normalizedKey.replace(/_/g, '');
    if (this.fieldMappings[noUnderscores]) {
      return this.fieldMappings[noUnderscores];
    }

    // Try removing spaces (e.g., "active power" -> "activepower")
    const noSpaces = normalizedKey.replace(/\s+/g, '');
    if (this.fieldMappings[noSpaces]) {
      return this.fieldMappings[noSpaces];
    }

    // Try replacing underscores with spaces (e.g., "active_power" -> "active power")
    const withSpaces = normalizedKey.replace(/_/g, ' ');
    if (this.fieldMappings[withSpaces]) {
      return this.fieldMappings[withSpaces];
    }

    // Try partial matches for known patterns
    // Active power variations
    if (
      normalizedKey.includes('active') && normalizedKey.includes('power') ||
      normalizedKey === 'pac' ||
      normalizedKey.startsWith('pac(')
    ) {
      return 'activePowerWatts';
    }

    // Daily energy variations
    if (
      (normalizedKey.includes('e') && normalizedKey.includes('day')) ||
      (normalizedKey.includes('energy') && normalizedKey.includes('today')) ||
      (normalizedKey.includes('daily') && normalizedKey.includes('energy')) ||
      normalizedKey === 'eday' ||
      normalizedKey.startsWith('eday(')
    ) {
      return 'energyDailyKwh';
    }

    // Irradiance variations
    if (normalizedKey.includes('irradiance')) {
      return 'irradiance';
    }

    return null;
  }

  /**
   * Parse string value to number, handling various formats
   */
  private parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }

    const str = String(value).trim();
    if (str === '' || str === '-' || str === 'N/A' || str === 'null') {
      return null;
    }

    // Remove common units and thousands separators
    const cleaned = str
      .replace(/[,\s]/g, '') // Remove commas and spaces
      .replace(/[a-zA-Z%°]+$/, '') // Remove trailing units
      .trim();

    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Normalize field name for metadata storage
   * Converts "DC Voltage 1" -> "dcVoltage1"
   */
  private normalizeFieldName(name: string): string {
    return name
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars
      .replace(/\s+(.)/g, (_, char) => char.toUpperCase()) // camelCase
      .replace(/^\w/, (char) => char.toLowerCase()); // lowercase first
  }
}
