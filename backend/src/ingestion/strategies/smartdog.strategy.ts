import { Injectable, Logger } from '@nestjs/common';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * SmartDog Data Logger Parser Strategy
 *
 * Handles three types of SmartDog data files:
 *
 * 1. Inverter Global Data: B{bus}_A{address}_S{stringid}_global_{date}.txt
 *    - Semicolon-delimited CSV with pac, pdc, udc, temp
 *    - Unix timestamp (seconds)
 *
 * 2. Modbus TCP Sensor: modbustcpsensor_{id}_global_{date}.txt
 *    - Irradiance sensor data (W/m²)
 *    - Format: timestamp;value (with extra -1 status column)
 *
 * 3. OneWire Sensor: onewire_{id}_global_{date}.txt
 *    - Temperature sensor data (°C)
 *    - Same format as Modbus sensor
 *
 * Skipped file types (not measurement data):
 * - *_avg_*.txt (pre-aggregated data)
 * - events_*.txt (alarm/event logs)
 */
@Injectable()
export class SmartdogParser implements IParser {
  private readonly logger = new Logger(SmartdogParser.name);

  readonly name = 'smartdog';
  readonly description = 'SmartDog Logger CSV Export';

  /** Current filename being parsed (set by canHandle) */
  private currentFilename = '';

  /** File type patterns (allow optional smartdog_ prefix from controller) */
  private static readonly INVERTER_PATTERN =
    /^(?:smartdog_)?B(\d+)_A(\d+)_S(\d+)_global_\d+_\d+_\d+\.txt$/i;
  private static readonly MODBUS_PATTERN =
    /^(?:smartdog_)?modbustcpsensor_(\d+)_global_\d+_\d+_\d+\.txt$/i;
  private static readonly ONEWIRE_PATTERN =
    /^(?:smartdog_)?onewire_(\d+)_global_\d+_\d+_\d+\.txt$/i;

  /** Skip patterns - files we don't process */
  private static readonly SKIP_PATTERNS = [
    /avg_day/i,
    /avg_month/i,
    /avg_year/i,
    /events_/i,
  ];

  /** Valid timestamp range (Unix seconds) */
  private static readonly MIN_TIMESTAMP = 946684800; // 2000-01-01
  private static readonly MAX_TIMESTAMP = 4102444800; // 2100-01-01

  /**
   * Semantic translation map for metadata keys
   */
  private readonly TRANSLATION_MAP: Record<string, string> = {
    pdc: 'dcPowerWatts',
    udc: 'dcVoltage',
    temp: 'inverterTemperature',
    address: 'deviceAddress',
    bus: 'busNumber',
    strings: 'stringCount',
    stringid: 'stringId',
  };

  /**
   * Detect if this parser can handle the file
   */
  canHandle(filename: string, snippet: string): boolean {
    // Skip aggregation and event files
    for (const pattern of SmartdogParser.SKIP_PATTERNS) {
      if (pattern.test(filename)) {
        return false;
      }
    }

    // Check for SmartDog file patterns
    const isInverter = SmartdogParser.INVERTER_PATTERN.test(filename);
    const isModbus = SmartdogParser.MODBUS_PATTERN.test(filename);
    const isOnewire = SmartdogParser.ONEWIRE_PATTERN.test(filename);

    if (isInverter || isModbus || isOnewire) {
      // Verify content matches expected format
      const hasInverterHeader = snippet.includes('timestamp;address;bus;');
      const hasSensorHeader =
        snippet.includes('timestamp;value') ||
        snippet.startsWith('timestamp;value');

      if (isInverter && hasInverterHeader) {
        this.currentFilename = filename;
        return true;
      }
      if ((isModbus || isOnewire) && hasSensorHeader) {
        this.currentFilename = filename;
        return true;
      }
    }

    return false;
  }

  /**
   * Parse SmartDog file based on detected type
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    await Promise.resolve();

    const content = fileBuffer.toString('utf-8');
    const lines = content.split('\n');

    if (lines.length < 2) {
      throw new ParserError(
        this.name,
        'File is empty or has insufficient data',
      );
    }

    const fileType = this.detectFileType(this.currentFilename);

    switch (fileType) {
      case 'inverter':
        yield* this.parseInverterData(lines, this.currentFilename);
        break;
      case 'modbus':
        yield* this.parseModbusSensor(lines, this.currentFilename);
        break;
      case 'onewire':
        yield* this.parseOneWireSensor(lines, this.currentFilename);
        break;
      default:
        throw new ParserError(
          this.name,
          `Unknown file type: ${this.currentFilename}`,
        );
    }
  }

  /**
   * Detect file type from filename
   */
  private detectFileType(
    filename: string,
  ): 'inverter' | 'modbus' | 'onewire' | null {
    if (SmartdogParser.INVERTER_PATTERN.test(filename)) return 'inverter';
    if (SmartdogParser.MODBUS_PATTERN.test(filename)) return 'modbus';
    if (SmartdogParser.ONEWIRE_PATTERN.test(filename)) return 'onewire';
    return null;
  }

  /**
   * Extract logger ID from inverter filename
   * B1_A3_S6_global_11_4_2025.txt -> SMARTDOG_B1_A3_S6
   */
  private extractInverterLoggerId(filename: string): string {
    const match = SmartdogParser.INVERTER_PATTERN.exec(filename);
    if (match) {
      const [, bus, address, stringId] = match;
      return `SMARTDOG_B${bus}_A${address}_S${stringId}`;
    }
    return 'SMARTDOG_UNKNOWN';
  }

  /**
   * Extract sensor ID from modbus filename
   * modbustcpsensor_1612427023_global_11_8_2025.txt -> SMARTDOG_SENSOR_1612427023
   */
  private extractModbusLoggerId(filename: string): string {
    const match = SmartdogParser.MODBUS_PATTERN.exec(filename);
    if (match) {
      return `SMARTDOG_SENSOR_${match[1]}`;
    }
    return 'SMARTDOG_SENSOR_UNKNOWN';
  }

  /**
   * Extract sensor ID from onewire filename
   * onewire_1647527200_global_10_2_2025.txt -> SMARTDOG_TEMP_1647527200
   */
  private extractOnewireLoggerId(filename: string): string {
    const match = SmartdogParser.ONEWIRE_PATTERN.exec(filename);
    if (match) {
      return `SMARTDOG_TEMP_${match[1]}`;
    }
    return 'SMARTDOG_TEMP_UNKNOWN';
  }

  /**
   * Parse inverter global data files
   * Format: timestamp;address;bus;strings;stringid;pac;pdc;udc;temp
   */
  private async *parseInverterData(
    lines: string[],
    filename: string,
  ): AsyncGenerator<UnifiedMeasurementDTO> {
    await Promise.resolve();
    const loggerId = this.extractInverterLoggerId(filename);
    let dataRowCount = 0;

    // First line is header
    const headerLine = lines[0]?.trim().toLowerCase();
    if (!headerLine?.includes('timestamp') || !headerLine?.includes('pac')) {
      throw new ParserError(
        this.name,
        'Invalid inverter header. Expected timestamp;address;bus;strings;stringid;pac;pdc;udc;temp',
      );
    }

    const headers = headerLine.split(';').map((h) => h.trim());

    // Process data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const dto = this.parseInverterRow(line, headers, loggerId, i);
      if (dto) {
        dataRowCount++;
        yield dto;
      }
    }

    this.logger.log(`Parsed ${dataRowCount} inverter rows from ${filename}`);

    if (dataRowCount === 0) {
      throw new ParserError(this.name, 'No valid data rows found in file');
    }
  }

  /**
   * Parse a single inverter data row
   */
  private parseInverterRow(
    line: string,
    headers: string[],
    loggerId: string,
    lineNum: number,
  ): UnifiedMeasurementDTO | null {
    const values = line.split(';').map((v) => v.trim());

    if (values.length !== headers.length) {
      this.logger.warn(
        `Row ${lineNum + 1}: Column count mismatch (expected ${headers.length}, got ${values.length})`,
      );
      return null;
    }

    // Build row object
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j];
    }

    // Extract and validate timestamp (Unix seconds)
    const timestampValue = row['timestamp'];
    const timestamp = this.parseUnixTimestamp(timestampValue);
    if (!timestamp) {
      this.logger.warn(
        `Row ${lineNum + 1}: Invalid timestamp ${timestampValue}`,
      );
      return null;
    }

    // Extract golden metric: pac (AC Power in Watts)
    const pac = this.parseNumber(row['pac']);

    // Build metadata with semantic normalization
    const metadata: Record<string, unknown> = {};
    const skipFields = new Set(['timestamp', 'pac']);

    for (const [key, value] of Object.entries(row)) {
      if (skipFields.has(key)) continue;

      const numValue = this.parseNumber(value);
      const semanticKey = this.TRANSLATION_MAP[key] || key;
      metadata[semanticKey] = numValue ?? value;
    }

    return {
      timestamp,
      loggerId,
      loggerType: 'smartdog',
      activePowerWatts: pac,
      energyDailyKwh: null, // Not available in raw data
      irradiance: null,
      metadata,
    };
  }

  /**
   * Parse Modbus TCP sensor files (irradiance)
   * Format: timestamp;value (with trailing -1 status column)
   */
  private async *parseModbusSensor(
    lines: string[],
    filename: string,
  ): AsyncGenerator<UnifiedMeasurementDTO> {
    await Promise.resolve();
    const loggerId = this.extractModbusLoggerId(filename);
    let dataRowCount = 0;

    // First line is header
    const headerLine = lines[0]?.trim().toLowerCase();
    if (!headerLine?.includes('timestamp') || !headerLine?.includes('value')) {
      throw new ParserError(
        this.name,
        'Invalid sensor header. Expected timestamp;value',
      );
    }

    // Process data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const dto = this.parseSensorRow(line, loggerId, 'modbus', i);
      if (dto) {
        dataRowCount++;
        yield dto;
      }
    }

    this.logger.log(
      `Parsed ${dataRowCount} modbus sensor rows from ${filename}`,
    );

    if (dataRowCount === 0) {
      throw new ParserError(this.name, 'No valid data rows found in file');
    }
  }

  /**
   * Parse OneWire sensor files (temperature)
   * Format: timestamp;value (with trailing -1 status column)
   */
  private async *parseOneWireSensor(
    lines: string[],
    filename: string,
  ): AsyncGenerator<UnifiedMeasurementDTO> {
    await Promise.resolve();
    const loggerId = this.extractOnewireLoggerId(filename);
    let dataRowCount = 0;

    // First line is header
    const headerLine = lines[0]?.trim().toLowerCase();
    if (!headerLine?.includes('timestamp') || !headerLine?.includes('value')) {
      throw new ParserError(
        this.name,
        'Invalid sensor header. Expected timestamp;value',
      );
    }

    // Process data rows (skip header)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const dto = this.parseSensorRow(line, loggerId, 'onewire', i);
      if (dto) {
        dataRowCount++;
        yield dto;
      }
    }

    this.logger.log(
      `Parsed ${dataRowCount} onewire sensor rows from ${filename}`,
    );

    if (dataRowCount === 0) {
      throw new ParserError(this.name, 'No valid data rows found in file');
    }
  }

  /**
   * Parse a single sensor data row
   * Handles the extra -1 status column (3 cols, 2 headers)
   */
  private parseSensorRow(
    line: string,
    loggerId: string,
    sensorType: 'modbus' | 'onewire',
    lineNum: number,
  ): UnifiedMeasurementDTO | null {
    const values = line.split(';').map((v) => v.trim());

    // Expect at least 2 columns (timestamp, value), may have 3rd status column
    if (values.length < 2) {
      this.logger.warn(`Row ${lineNum + 1}: Insufficient columns`);
      return null;
    }

    const timestampValue = values[0];
    const sensorValue = values[1];

    // Parse timestamp
    const timestamp = this.parseUnixTimestamp(timestampValue);
    if (!timestamp) {
      this.logger.warn(
        `Row ${lineNum + 1}: Invalid timestamp ${timestampValue}`,
      );
      return null;
    }

    // Parse sensor value
    const value = this.parseNumber(sensorValue);
    if (value === null) {
      this.logger.warn(
        `Row ${lineNum + 1}: Invalid sensor value ${sensorValue}`,
      );
      return null;
    }

    if (sensorType === 'modbus') {
      // Modbus sensor -> irradiance (W/m²)
      return {
        timestamp,
        loggerId,
        loggerType: 'smartdog',
        activePowerWatts: null,
        energyDailyKwh: null,
        irradiance: value,
        metadata: {},
      };
    } else {
      // OneWire sensor -> ambient temperature
      return {
        timestamp,
        loggerId,
        loggerType: 'smartdog',
        activePowerWatts: null,
        energyDailyKwh: null,
        irradiance: null,
        metadata: {
          ambientTemperature: value,
        },
      };
    }
  }

  /**
   * Parse Unix timestamp (seconds) to Date
   */
  private parseUnixTimestamp(value: string): Date | null {
    if (!value || value.trim() === '') return null;

    const timestamp = Number.parseInt(value.trim(), 10);
    if (Number.isNaN(timestamp)) return null;

    // Validate timestamp range
    if (
      timestamp < SmartdogParser.MIN_TIMESTAMP ||
      timestamp > SmartdogParser.MAX_TIMESTAMP
    ) {
      return null;
    }

    // Convert seconds to milliseconds
    return new Date(timestamp * 1000);
  }

  /**
   * Parse string to number
   */
  private parseNumber(value: string): number | null {
    if (!value || value.trim() === '' || value === '-' || value === 'N/A') {
      return null;
    }

    const cleaned = value.trim().replaceAll(',', '.');
    const num = Number.parseFloat(cleaned);
    return Number.isNaN(num) ? null : num;
  }
}
