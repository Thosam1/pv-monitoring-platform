import { Injectable, Logger } from '@nestjs/common';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import Database from 'better-sqlite3';

/**
 * Row structure from tbl_inverterdata
 */
interface InverterDataRow {
  id_inverter: number;
  acproduction: number;
  optionalvalue: string | null;
  timestamp: string;
}

/**
 * Plexlog SQLite Parser Strategy
 *
 * Handles SQLite database files (.s3db) from Plexlog data loggers.
 *
 * File Structure:
 * - data_DD_MM_YYYY_HH_MM.s3db: Contains measurement data in tbl_inverterdata
 * - config_*.s3db: Contains device configuration (not processed)
 * - protocoll_*.s3db: Contains protocol logs (not processed)
 *
 * Table Schema (tbl_inverterdata):
 * - id_inverter: INTEGER - Device identifier
 * - acproduction: INTEGER - AC power in Watts (or irradiance for sensors)
 * - optionalvalue: NVARCHAR - Key-value pairs (semicolon-separated, colon-delimited)
 * - timestamp: TEXT - ISO 8601 format (e.g., "2025-10-13T10:55:00.0000000")
 *
 * optionalvalue format examples:
 * - Inverters: "T00:29.8;tot:381936;uac:235;p01:1843;u01:734;..."
 * - Sensors: "tce:17.8;tex:14.1;wds:0.0"
 * - Meters: "exp:0.000;imp:0.000;frq:49.986;cos:1.000;..."
 */
@Injectable()
export class PlexlogParser implements IParser {
  private readonly logger = new Logger(PlexlogParser.name);

  readonly name = 'plexlog';
  readonly description = 'Plexlog SQLite Database Export (.s3db)';

  /**
   * SQLite file magic bytes: "SQLite format 3\0"
   */
  private readonly SQLITE_MAGIC = 'SQLite format 3\0';

  /**
   * Expected data table name
   */
  private readonly DATA_TABLE = 'tbl_inverterdata';

  /**
   * Known sensor device IDs (irradiance/environmental sensors)
   *
   * IMPORTANT: These device IDs determine how `acproduction` is interpreted:
   * - Sensor devices (listed here): acproduction = irradiance (W/m²)
   * - All other devices: acproduction = activePowerWatts (W)
   *
   * Device ID mapping (based on Plexlog configuration):
   * - 10: Irradiance sensor (pyranometer)
   *
   * LIMITATIONS:
   * - Only device ID 10 is currently recognized as a sensor
   * - If your installation has other sensor device IDs, add them to this set
   * - Device IDs not in this set will incorrectly map irradiance to activePowerWatts
   *
   * To identify sensor device IDs in your data:
   * 1. Query: SELECT DISTINCT id_inverter, optionalvalue FROM tbl_inverterdata
   * 2. Sensors typically have optionalvalue with keys like: tce, tex, wds
   * 3. Inverters typically have: tot, uac, p01, u01
   */
  private readonly SENSOR_DEVICE_IDS = new Set([10]);

  /**
   * Semantic translation map for optionalvalue fields
   * Maps raw codes to industry-standard camelCase names
   */
  private readonly TRANSLATION_MAP: Record<string, string> = {
    // Temperature measurements
    t00: 'temperatureModule',
    tce: 'temperatureCell',
    tex: 'temperatureAmbient',
    // Energy totals
    tot: 'totalEnergyKwh',
    // AC measurements
    uac: 'voltageAC',
    rpw: 'reactivePowerVar',
    bat: 'batteryValue',
    chr: 'chargeValue',
    // Grid meter fields
    exp: 'energyExportKwh',
    imp: 'energyImportKwh',
    frq: 'gridFrequencyHz',
    cos: 'powerFactor',
    app: 'apparentPowerVa',
    ull: 'voltageLLSum',
    ul1: 'voltageL1',
    ul2: 'voltageL2',
    ul3: 'voltageL3',
    il1: 'currentL1',
    il2: 'currentL2',
    il3: 'currentL3',
    iln: 'currentNeutral',
    ql1: 'reactivePowerL1',
    ql2: 'reactivePowerL2',
    ql3: 'reactivePowerL3',
    // Weather
    wds: 'windSpeed',
  };

  /**
   * Pattern map for numbered fields (p01, u01, etc.)
   */
  private readonly NUMBERED_PATTERNS: Record<string, string> = {
    p: 'dcPower',
    u: 'dcVoltage',
  };

  /**
   * Detect if this parser can handle the file
   *
   * Checks:
   * 1. Filename pattern: data_*.s3db or *.s3db
   * 2. SQLite magic bytes at file start
   */
  canHandle(filename: string, snippet: string): boolean {
    // Check filename pattern
    const filenameMatch = /\.s3db$/i.test(filename) && /^data_/i.test(filename);

    // Check SQLite magic bytes (first 16 bytes)
    const hasSqliteMagic = snippet.startsWith(this.SQLITE_MAGIC);

    return filenameMatch || hasSqliteMagic;
  }

  /**
   * Parse SQLite database file and yield measurement records
   *
   * Implementation:
   * 1. Write Buffer to temp file (better-sqlite3 requires file path)
   * 2. Open database and verify table exists
   * 3. Query all records from tbl_inverterdata
   * 4. Transform each row to UnifiedMeasurementDTO
   * 5. Cleanup temp file
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    // Yield control to event loop
    await Promise.resolve();

    if (fileBuffer.length === 0) {
      throw new ParserError(this.name, 'File is empty');
    }

    // Verify SQLite magic bytes
    const header = fileBuffer.toString('utf-8', 0, 16);
    if (!header.startsWith(this.SQLITE_MAGIC)) {
      throw new ParserError(this.name, 'Invalid SQLite file format');
    }

    // Write buffer to temp file
    const tempPath = this.createTempFile(fileBuffer);
    let db: Database.Database | null = null;

    try {
      db = new Database(tempPath, { readonly: true });

      // Verify data table exists
      const tables = this.listTables(db);
      if (!tables.includes(this.DATA_TABLE)) {
        throw new ParserError(
          this.name,
          `Table '${this.DATA_TABLE}' not found. Available tables: ${tables.join(', ')}`,
        );
      }

      // Query all data
      const rows = this.queryData(db);
      this.logger.log(`Found ${rows.length} records in ${this.DATA_TABLE}`);

      if (rows.length === 0) {
        throw new ParserError(
          this.name,
          'No data rows found in tbl_inverterdata',
        );
      }

      let processedCount = 0;
      for (const row of rows) {
        const dto = this.transformRowToDTO(row);
        if (dto) {
          processedCount++;
          yield dto;
        }
      }

      this.logger.log(`Parsed ${processedCount} records from Plexlog database`);
    } finally {
      // Cleanup
      if (db) {
        db.close();
      }
      this.cleanupTempFile(tempPath);
    }
  }

  /**
   * Create temporary file from buffer
   */
  private createTempFile(buffer: Buffer): string {
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `plexlog_${Date.now()}.s3db`);
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  }

  /**
   * Remove temporary file
   */
  private cleanupTempFile(tempPath: string): void {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp file: ${tempPath}`, error);
    }
  }

  /**
   * List all tables in the database
   */
  private listTables(db: Database.Database): string[] {
    const stmt = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'",
    );
    const rows = stmt.all() as { name: string }[];
    return rows.map((r) => r.name);
  }

  /**
   * Query all data from tbl_inverterdata
   */
  private queryData(db: Database.Database): InverterDataRow[] {
    const stmt = db.prepare(
      `SELECT id_inverter, acproduction, optionalvalue, timestamp FROM ${this.DATA_TABLE} ORDER BY timestamp`,
    );
    return stmt.all() as InverterDataRow[];
  }

  /**
   * Transform database row to UnifiedMeasurementDTO
   */
  private transformRowToDTO(
    row: InverterDataRow,
  ): UnifiedMeasurementDTO | null {
    const timestamp = this.parseTimestamp(row.timestamp);
    if (!timestamp) {
      this.logger.warn(`Invalid timestamp: ${row.timestamp}`);
      return null;
    }

    const loggerId = `plexlog_${row.id_inverter}`;
    const isSensor = this.SENSOR_DEVICE_IDS.has(row.id_inverter);

    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId,
      loggerType: 'plexlog',
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    // Map acproduction to appropriate golden metric
    if (isSensor) {
      // Sensor devices: acproduction is irradiance (W/m²)
      dto.irradiance = row.acproduction;
    } else {
      // Inverter/meter devices: acproduction is AC power (W)
      dto.activePowerWatts = row.acproduction;
    }

    // Parse optionalvalue for additional metrics
    const metadata = this.parseOptionalValue(row.optionalvalue);
    dto.metadata = metadata;

    return dto;
  }

  /**
   * Parse timestamp from SQLite format
   * Expected format: "2025-10-13T10:55:00.0000000"
   */
  private parseTimestamp(value: string): Date | null {
    if (!value) return null;

    // Remove excess precision (7 decimal places -> 3)
    const normalized = value.replace(/\.(\d{3})\d*$/, '.$1');

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  /**
   * Parse optionalvalue field into metadata object
   *
   * Format: "key1:value1;key2:value2;..."
   * Example: "T00:29.8;tot:381936;uac:235;p01:1843;u01:734"
   */
  private parseOptionalValue(
    optionalvalue: string | null,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (!optionalvalue) {
      return metadata;
    }

    const pairs = optionalvalue.split(';');

    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex === -1) continue;

      const key = pair.slice(0, colonIndex).trim().toLowerCase();
      const rawValue = pair.slice(colonIndex + 1).trim();

      if (!key) continue;

      const numericValue = this.parseNumber(rawValue);
      const semanticKey = this.normalizeFieldName(key);

      metadata[semanticKey] = numericValue;
    }

    return metadata;
  }

  /**
   * Parse string to number
   */
  private parseNumber(value: string): number | null {
    if (!value || value === '' || value === 'N/A') {
      return null;
    }

    // Handle comma as decimal separator
    const cleaned = value.replaceAll(',', '.');
    const num = Number.parseFloat(cleaned);

    if (Number.isNaN(num)) return null;

    // Normalize -0 to 0
    return Object.is(num, -0) ? 0 : num;
  }

  /**
   * Normalize field name to semantic camelCase
   *
   * Examples:
   * - tot -> totalEnergyKwh
   * - uac -> voltageAC
   * - p01 -> dcPower1
   * - u05 -> dcVoltage5
   * - T00 -> temperatureModule
   */
  private normalizeFieldName(name: string): string {
    if (!name) return '';

    const lowerName = name.toLowerCase();

    // Check for exact match in translation map
    if (this.TRANSLATION_MAP[lowerName]) {
      return this.TRANSLATION_MAP[lowerName];
    }

    // Check for numbered patterns (p01, u01, etc.)
    const numberedMatch = /^([pu])(\d{2})$/.exec(lowerName);
    if (numberedMatch) {
      const prefix = numberedMatch[1];
      const number = Number.parseInt(numberedMatch[2], 10);
      const semanticPrefix = this.NUMBERED_PATTERNS[prefix];
      if (semanticPrefix) {
        return `${semanticPrefix}${number}`;
      }
    }

    // Fallback: convert to camelCase
    const parts = name.split(/[_-]/);
    return parts
      .map((part, index) => {
        const lower = part.toLowerCase();
        if (index === 0) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join('');
  }
}
