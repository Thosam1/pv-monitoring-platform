import { Injectable, Logger } from '@nestjs/common';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * State machine states for parsing INI-style Meteo Control files
 */
enum ParseState {
  INITIAL = 'INITIAL',
  INFO = 'INFO',
  MESSUNG = 'MESSUNG',
  DATA = 'DATA',
}

/**
 * Date components extracted from Datum field
 */
interface DateComponents {
  year: number;
  month: number; // 0-indexed for JS Date
  day: number;
}

/**
 * File type for MeteoControl exports
 */
type MeteoControlFileType = 'analog' | 'inverter';

/**
 * Meteo Control Web Platform Parser Strategy
 *
 * Handles INI-style text files exported from Meteo Control web platform.
 * Supports both delta_analog (irradiance) and delta_inverter (power/energy) files.
 *
 * File Structure (both types):
 * [info]
 * Anlage=Turnow-P. 1 FF - Strang N2
 * Datum=251106                        # YYMMDD format
 *
 * [messung]
 * Headers row (semicolon-separated)
 * Units row (semicolon-separated)
 *
 * [Start]
 * Data rows...
 *
 * delta_analog (irradiance sensors):
 * - One row per timestamp with multiple G_M/G_H columns
 * - G_M6 -> irradiance (golden metric)
 * - loggerId from Anlage field
 *
 * delta_inverter (inverter telemetry):
 * - Multiple rows per timestamp (one per inverter)
 * - Serien Nummer -> loggerId (per row)
 * - Pac (kW) -> activePowerWatts (× 1000)
 * - E_Tag (kWh) -> energyDailyKwh
 */
@Injectable()
export class MeteoControlParser implements IParser {
  private readonly logger = new Logger(MeteoControlParser.name);

  readonly name = 'meteocontrol';
  readonly description =
    'Meteo Control Web Platform INI Export (delta_analog, delta_inverter)';

  /**
   * Primary reference sensor for irradiance golden metric (analog files)
   */
  private readonly IRRADIANCE_COLUMN = 'g_m6';

  /**
   * Column containing inverter serial number (inverter files)
   */
  private readonly SERIAL_COLUMN = 'serien nummer';

  /**
   * Field mappings for inverter golden metrics
   * Maps column header -> { field, conversionFactor }
   */
  private readonly INVERTER_FIELD_MAPPINGS: Record<
    string,
    {
      field: 'activePowerWatts' | 'energyDailyKwh';
      factor: number;
    }
  > = {
    pac: { field: 'activePowerWatts', factor: 1000 }, // kW -> W
    e_tag: { field: 'energyDailyKwh', factor: 1 }, // already kWh
  };

  /**
   * Semantic translation map for solar domain terminology
   * Maps raw sensor code prefixes to industry-standard names
   *
   * Analog sensors:
   * - G_M = Global Modul (Plane of Array irradiance on tilted surface)
   * - G_H = Global Horizontal (irradiance on flat ground)
   *
   * Inverter fields:
   * - Uac = AC Voltage, Fac = AC Frequency
   * - Upv/Ipv/Ppv = DC Voltage/Current/Power
   * - E_Total/E_Tag/E_Int = Energy totals
   */
  private readonly TRANSLATION_MAP: Record<string, string> = {
    // Analog irradiance sensors
    g_m: 'irradiancePoa', // Plane of Array - critical for PR calculations
    g_h: 'irradianceGhi', // Global Horizontal - used for weather comparison
    // Inverter AC measurements
    uac_l1: 'voltageAcPhaseA',
    uac_l2: 'voltageAcPhaseB',
    uac_l3: 'voltageAcPhaseC',
    fac: 'gridFrequencyHz',
    // Inverter DC measurements
    upv_ist: 'voltageDcActual',
    upv0: 'voltageDcOpen',
    ipv: 'currentDcAmps',
    ppv: 'powerDcKw',
    // Energy totals
    e_total: 'energyLifetimeKwh',
    e_int: 'energyIntervalKwh',
    // Temperatures
    tsc: 'temperatureStringC',
    tpt100: 'temperaturePt100C',
    tkk: 'temperatureInverterC',
    // Other
    riso: 'insulationResistanceKohm',
    h_total: 'operatingHoursTotal',
    h_on: 'operatingHoursOn',
  };

  /**
   * Handle state transitions based on section markers
   * Returns new state if transition occurs, null otherwise
   */
  private handleStateTransition(line: string): ParseState | null {
    const lower = line.toLowerCase();
    if (lower === '[info]') return ParseState.INFO;
    if (lower === '[messung]') return ParseState.MESSUNG;
    if (lower === '[start]') return ParseState.DATA;
    return null;
  }

  /**
   * Detect if this parser can handle the file
   *
   * Heuristics:
   * - Filename contains "delta_analog" or "delta_inverter" (case-insensitive)
   * - Content has [info] section with Datum= and either:
   *   - G_M columns (irradiance sensors) for analog files
   *   - Serien Nummer column for inverter files
   */
  canHandle(filename: string, snippet: string): boolean {
    // Accept both delta_analog and delta_inverter filenames
    const filenameMatch = /delta_(analog|inverter)/i.test(filename);

    // Content detection for both types
    const hasInfoSection =
      snippet.includes('[info]') && /Datum=\d{6}/i.test(snippet);
    const hasIrradianceData = /G_M\d+/i.test(snippet); // delta_analog
    const hasInverterData = /Serien Nummer/i.test(snippet); // delta_inverter

    return (
      filenameMatch ||
      (hasInfoSection && (hasIrradianceData || hasInverterData))
    );
  }

  /**
   * Detect file type based on headers
   * - 'inverter' if headers contain inverter-specific columns (serien nummer, pac)
   * - 'analog' otherwise (irradiance sensor data)
   */
  private detectFileType(headers: string[]): MeteoControlFileType {
    if (
      headers.includes(this.SERIAL_COLUMN) ||
      headers.includes('pac') ||
      headers.includes('e_tag')
    ) {
      return 'inverter';
    }
    return 'analog';
  }

  /**
   * Parser context holding state machine variables
   */
  private createParserContext(): {
    state: ParseState;
    dateComponents: DateComponents | null;
    fallbackLoggerId: string;
    headers: string[];
    fileType: MeteoControlFileType;
    dataRowCount: number;
  } {
    return {
      state: ParseState.INITIAL,
      dateComponents: null,
      fallbackLoggerId: 'METEOCONTROL_Unknown',
      headers: [],
      fileType: 'analog',
      dataRowCount: 0,
    };
  }

  /**
   * Process INFO state line
   */
  private processInfoState(
    line: string,
    ctx: ReturnType<typeof this.createParserContext>,
  ): void {
    this.processInfoLine(
      line,
      (datum) => {
        ctx.dateComponents = this.parseDatum(datum);
      },
      (anlage) => {
        ctx.fallbackLoggerId = this.sanitizeLoggerId(anlage);
      },
    );
  }

  /**
   * Process MESSUNG state line (headers)
   */
  private processMessungState(
    line: string,
    ctx: ReturnType<typeof this.createParserContext>,
  ): void {
    if (ctx.headers.length === 0) {
      ctx.headers = this.parseHeaders(line);
      ctx.fileType = this.detectFileType(ctx.headers);
      this.logger.debug(`Detected file type: ${ctx.fileType}`);
    }
  }

  /**
   * Process DATA state line
   * Returns DTO if valid data row, null otherwise
   */
  private processDataState(
    line: string,
    ctx: ReturnType<typeof this.createParserContext>,
  ): UnifiedMeasurementDTO | null {
    if (this.isMarkerLine(line)) return null;
    if (!ctx.dateComponents) {
      this.logger.warn('No Datum found in [info] section, skipping data');
      return null;
    }
    return this.transformRowToDTO(
      line,
      ctx.headers,
      ctx.dateComponents,
      ctx.fallbackLoggerId,
      ctx.fileType,
    );
  }

  /**
   * Parse Meteo Control INI file using state machine
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    await Promise.resolve();

    const content = fileBuffer.toString('utf-8');
    const lines = content.split(/\r?\n/);

    if (lines.length === 0 || content.trim() === '') {
      throw new ParserError(this.name, 'File is empty');
    }

    const ctx = this.createParserContext();

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine === '') continue;

      const newState = this.handleStateTransition(trimmedLine);
      if (newState !== null) {
        ctx.state = newState;
        continue;
      }

      const dto = this.processLineByState(trimmedLine, ctx);
      if (dto) {
        ctx.dataRowCount++;
        yield dto;
      }
    }

    this.logger.log(
      `Parsed ${ctx.dataRowCount} data rows from Meteo Control ${ctx.fileType} file`,
    );

    if (ctx.dataRowCount === 0) {
      throw new ParserError(
        this.name,
        'No valid data rows found. Check file format.',
      );
    }
  }

  /**
   * Process a line based on current parser state
   */
  private processLineByState(
    line: string,
    ctx: ReturnType<typeof this.createParserContext>,
  ): UnifiedMeasurementDTO | null {
    switch (ctx.state) {
      case ParseState.INFO:
        this.processInfoState(line, ctx);
        return null;
      case ParseState.MESSUNG:
        this.processMessungState(line, ctx);
        return null;
      case ParseState.DATA:
        return this.processDataState(line, ctx);
      default:
        return null;
    }
  }

  /**
   * Process a line from [info] section
   * Extracts Datum and Anlage values
   */
  private processInfoLine(
    line: string,
    onDatum: (datum: string) => void,
    onAnlage: (anlage: string) => void,
  ): void {
    const parts = line.split('=');
    if (parts.length < 2) return;

    const key = parts[0].trim().toLowerCase();
    const value = parts.slice(1).join('=').trim(); // Handle = in value

    if (key === 'datum') {
      onDatum(value);
    } else if (key === 'anlage') {
      onAnlage(value);
    }
  }

  /**
   * Parse Datum in YYMMDD format
   * "251106" -> { year: 2025, month: 10 (0-indexed), day: 6 }
   */
  private parseDatum(datum: string): DateComponents | null {
    if (!/^\d{6}$/.test(datum)) {
      this.logger.warn(`Invalid Datum format: ${datum}`);
      return null;
    }

    const yy = Number.parseInt(datum.slice(0, 2), 10);
    const mm = Number.parseInt(datum.slice(2, 4), 10);
    const dd = Number.parseInt(datum.slice(4, 6), 10);

    // Y2K handling: 00-99 -> 2000-2099
    const year = 2000 + yy;
    const month = mm - 1; // JS months are 0-indexed

    // Basic validation
    if (month < 0 || month > 11 || dd < 1 || dd > 31) {
      this.logger.warn(`Invalid date components in Datum: ${datum}`);
      return null;
    }

    return { year, month, day: dd };
  }

  /**
   * Sanitize Anlage value for use as loggerId
   * Replaces spaces, dots, and dashes with underscores for URL safety
   *
   * "Turnow-P. 1 FF - Strang N2" -> "Turnow-P_1_FF_Strang_N2"
   */
  private sanitizeLoggerId(anlage: string): string {
    if (!anlage) return 'METEOCONTROL_Unknown';

    // Replace spaces, dots, and multiple dashes with underscores
    // Then collapse multiple underscores into single
    return anlage
      .replaceAll(/[\s.]+/g, '_') // Replace spaces and dots with underscore
      .replaceAll(/-+/g, '_') // Replace dashes with underscore
      .replaceAll(/_+/g, '_') // Collapse multiple underscores
      .replaceAll(/(^_)|(_$)/g, ''); // Trim leading/trailing underscores
  }

  /**
   * Parse headers from [messung] section
   * "Uhrzeit;Intervall;G_M6;G_M10;..." -> ["uhrzeit", "intervall", "g_m6", "g_m10", ...]
   */
  private parseHeaders(line: string): string[] {
    return line.split(';').map((h) => h.trim().toLowerCase());
  }

  /**
   * Check if line is a marker line to skip
   * e.g., "Info;Time" interspersed in data
   */
  private isMarkerLine(line: string): boolean {
    const lower = line.toLowerCase();
    return lower.startsWith('info;') || lower === 'info';
  }

  /**
   * Columns to skip for metadata (non-numeric identifiers)
   */
  private readonly SKIP_METADATA_COLUMNS = new Set([
    'uhrzeit',
    'intervall',
    this.SERIAL_COLUMN,
    'adresse',
    'ip-adresse',
    'wartestatus',
    'mpc',
    'team_fkt',
    'status',
    'fehler',
  ]);

  /**
   * Transform a data row to UnifiedMeasurementDTO
   * Handles both analog (irradiance) and inverter (power/energy) files
   */
  private transformRowToDTO(
    line: string,
    headers: string[],
    dateComponents: DateComponents,
    fallbackLoggerId: string,
    fileType: MeteoControlFileType,
  ): UnifiedMeasurementDTO | null {
    const values = line.split(';').map((v) => v.trim());

    if (values.length === 0) {
      return null;
    }

    const timestamp = this.extractTimestamp(headers, values, dateComponents);
    if (!timestamp) {
      return null;
    }

    const loggerId = this.extractLoggerId(
      headers,
      values,
      fallbackLoggerId,
      fileType,
    );

    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId,
      loggerType: 'meteocontrol',
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {};
    this.mapFieldsToDTO(headers, values, fileType, dto, metadata);
    dto.metadata = metadata;

    return dto;
  }

  /**
   * Extract timestamp from row values
   */
  private extractTimestamp(
    headers: string[],
    values: string[],
    dateComponents: DateComponents,
  ): Date | null {
    const uhrzeitIndex = headers.indexOf('uhrzeit');
    const timeValue = uhrzeitIndex >= 0 ? values[uhrzeitIndex] : values[0];

    const timestamp = this.buildTimestamp(dateComponents, timeValue);
    if (!timestamp) {
      this.logger.warn(`Invalid time: ${timeValue}`);
    }
    return timestamp;
  }

  /**
   * Extract loggerId based on file type
   * - Analog: use fallback from Anlage field
   * - Inverter: use Serien Nummer from each row
   */
  private extractLoggerId(
    headers: string[],
    values: string[],
    fallbackLoggerId: string,
    fileType: MeteoControlFileType,
  ): string {
    if (fileType !== 'inverter') {
      return fallbackLoggerId;
    }

    const serialIndex = headers.indexOf(this.SERIAL_COLUMN);
    if (serialIndex >= 0 && values[serialIndex]) {
      return values[serialIndex];
    }
    return fallbackLoggerId;
  }

  /**
   * Map all fields from row to DTO and metadata
   */
  private mapFieldsToDTO(
    headers: string[],
    values: string[],
    fileType: MeteoControlFileType,
    dto: UnifiedMeasurementDTO,
    metadata: Record<string, unknown>,
  ): void {
    const limit = Math.min(headers.length, values.length);

    for (let i = 0; i < limit; i++) {
      const header = headers[i];
      const rawValue = values[i];

      if (this.handleSkipColumn(header, rawValue, metadata)) {
        continue;
      }

      const numericValue = this.parseNumber(rawValue);
      this.mapFieldByType(header, numericValue, fileType, dto, metadata);
    }
  }

  /**
   * Handle columns that should be skipped (but may extract interval)
   * Returns true if column was handled (should skip further processing)
   */
  private handleSkipColumn(
    header: string,
    rawValue: string,
    metadata: Record<string, unknown>,
  ): boolean {
    if (!this.SKIP_METADATA_COLUMNS.has(header)) {
      return false;
    }

    if (header === 'intervall') {
      const numericValue = this.parseNumber(rawValue);
      if (numericValue !== null) {
        metadata['intervalSeconds'] = numericValue;
      }
    }
    return true;
  }

  /**
   * Map a single field based on file type
   */
  private mapFieldByType(
    header: string,
    numericValue: number | null,
    fileType: MeteoControlFileType,
    dto: UnifiedMeasurementDTO,
    metadata: Record<string, unknown>,
  ): void {
    if (fileType === 'analog') {
      this.mapAnalogField(header, numericValue, dto, metadata);
    } else {
      this.mapInverterField(header, numericValue, dto, metadata);
    }
  }

  /**
   * Map field for analog file (irradiance sensors)
   */
  private mapAnalogField(
    header: string,
    numericValue: number | null,
    dto: UnifiedMeasurementDTO,
    metadata: Record<string, unknown>,
  ): void {
    if (header === this.IRRADIANCE_COLUMN) {
      dto.irradiance = numericValue;
    } else {
      metadata[this.normalizeFieldName(header)] = numericValue;
    }
  }

  /**
   * Map field for inverter file (power/energy metrics)
   */
  private mapInverterField(
    header: string,
    numericValue: number | null,
    dto: UnifiedMeasurementDTO,
    metadata: Record<string, unknown>,
  ): void {
    const mapping = this.INVERTER_FIELD_MAPPINGS[header];
    if (mapping && numericValue !== null) {
      dto[mapping.field] = numericValue * mapping.factor;
    } else {
      metadata[this.normalizeFieldName(header)] = numericValue;
    }
  }

  /**
   * Build timestamp from date components and time string
   * Handles 24:00:00 edge case (midnight next day)
   */
  private buildTimestamp(date: DateComponents, time: string): Date | null {
    const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;

    let hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    const second = Number.parseInt(match[3], 10);

    // Validate time components
    if (hour < 0 || hour > 24) return null;
    if (minute < 0 || minute > 59) return null;
    if (second < 0 || second > 59) return null;

    // Handle 24:00:00 edge case - treat as 00:00:00 next day
    let { year, month, day } = date;
    if (hour === 24) {
      hour = 0;
      // Increment day (Date handles month/year overflow)
      const nextDay = new Date(Date.UTC(year, month, day + 1));
      year = nextDay.getUTCFullYear();
      month = nextDay.getUTCMonth();
      day = nextDay.getUTCDate();
    }

    const timestamp = new Date(
      Date.UTC(year, month, day, hour, minute, second),
    );
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
  }

  /**
   * Parse string to number, handling edge cases
   * - Empty values -> null
   * - "-0" -> 0 (normalize negative zero)
   */
  private parseNumber(value: string): number | null {
    if (!value || value.trim() === '' || value === '-' || value === 'N/A') {
      return null;
    }

    // Handle comma as decimal separator (German format)
    const cleaned = value.trim().replaceAll(',', '.');
    const num = Number.parseFloat(cleaned);

    if (Number.isNaN(num)) return null;

    // Normalize -0 to 0
    return Object.is(num, -0) ? 0 : num;
  }

  /**
   * Normalize field name for metadata storage using solar domain terminology
   *
   * Examples:
   * - g_m6 -> irradiancePoa6 (Plane of Array sensor #6)
   * - g_m10 -> irradiancePoa10
   * - g_h2 -> irradianceGhi2 (Global Horizontal sensor #2)
   * - uac_l1 -> voltageAcPhaseA (exact match)
   * - fac -> gridFrequencyHz (exact match)
   * - unknown_field -> unknownField (camelCase fallback)
   */
  private normalizeFieldName(name: string): string {
    if (!name) return '';

    const lowerName = name.toLowerCase();

    // Check for exact match first (inverter fields like uac_l1, fac)
    if (this.TRANSLATION_MAP[lowerName]) {
      return this.TRANSLATION_MAP[lowerName];
    }

    // Check for prefix + numeric suffix patterns: g_m6 -> irradiancePoa6
    for (const [pattern, semanticName] of Object.entries(
      this.TRANSLATION_MAP,
    )) {
      if (lowerName.startsWith(pattern)) {
        // Extract numeric suffix: g_m6 -> 6, g_m10 -> 10
        const suffix = lowerName.slice(pattern.length);
        if (/^\d+$/.test(suffix)) {
          return `${semanticName}${suffix}`;
        }
      }
    }

    // Fallback: convert to camelCase
    const parts = name.split('_');
    return parts
      .map((part, index) => {
        const lower = part.toLowerCase();
        if (index === 0) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      })
      .join('');
  }
}
