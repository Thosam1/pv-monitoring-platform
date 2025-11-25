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
 * Meteo Control Web Platform Parser Strategy
 *
 * Handles INI-style text files exported from Meteo Control web platform.
 * Phase 1: delta_analog files for irradiance data only.
 *
 * File Structure:
 * [info]
 * Anlage=Turnow-P. 1 FF - Strang N2
 * Datum=251106                        # YYMMDD format
 *
 * [messung]
 * Uhrzeit;Intervall;G_M6;G_M10;...   # Headers
 * ;s;W/m²;W/m²;...                   # Units row
 *
 * [Start]
 * 12:45:00;900;657;637;...           # Data rows (time only!)
 * Info;Time                           # Skip these marker lines
 *
 * Field Mapping:
 * - Datum + Uhrzeit -> timestamp (combined)
 * - Anlage (sanitized) -> loggerId
 * - G_M6 -> irradiance (golden metric, primary reference sensor)
 * - Other G_* columns -> metadata
 * - activePowerWatts -> null (not in analog files)
 * - energyDailyKwh -> null (not in analog files)
 */
@Injectable()
export class MeteoControlParser implements IParser {
  private readonly logger = new Logger(MeteoControlParser.name);

  readonly name = 'meteocontrol';
  readonly description = 'Meteo Control Web Platform INI Export (delta_analog)';

  /**
   * Primary reference sensor for irradiance golden metric
   */
  private readonly IRRADIANCE_COLUMN = 'g_m6';

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
   * Heuristics (Phase 1 - delta_analog only):
   * - Filename contains "delta_analog" (case-insensitive)
   * - Content has [info] section with Datum= and G_M columns (irradiance sensors)
   */
  canHandle(filename: string, snippet: string): boolean {
    // Phase 1: Only delta_analog files
    const filenameMatch = /delta_analog/i.test(filename);

    // Content: INI-style with [info], Datum=, and G_M columns (irradiance)
    const contentMatch =
      snippet.includes('[info]') &&
      /Datum=\d{6}/i.test(snippet) &&
      /G_M\d+/i.test(snippet);

    return filenameMatch || contentMatch;
  }

  /**
   * Parse Meteo Control INI file using state machine
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    // Yield control to event loop for large files
    await Promise.resolve();

    const content = fileBuffer.toString('utf-8');
    const lines = content.split(/\r?\n/);

    if (lines.length === 0 || content.trim() === '') {
      throw new ParserError(this.name, 'File is empty');
    }

    let state = ParseState.INITIAL;
    let dateComponents: DateComponents | null = null;
    let loggerId = 'METEOCONTROL_Unknown';
    let headers: string[] = [];
    let dataRowCount = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines
      if (trimmedLine === '') continue;

      // State transitions on section markers
      const newState = this.handleStateTransition(trimmedLine);
      if (newState !== null) {
        state = newState;
        continue;
      }

      // Process line based on current state
      switch (state) {
        case ParseState.INFO:
          this.processInfoLine(
            trimmedLine,
            (datum) => {
              dateComponents = this.parseDatum(datum);
            },
            (anlage) => {
              loggerId = this.sanitizeLoggerId(anlage);
            },
          );
          break;

        case ParseState.MESSUNG:
          // First non-empty line is headers, second is units (skip)
          if (headers.length === 0) {
            headers = this.parseHeaders(trimmedLine);
          }
          // Units row starts with ; - skip it
          break;

        case ParseState.DATA: {
          // Skip marker lines like "Info;Time"
          if (this.isMarkerLine(trimmedLine)) {
            continue;
          }

          if (!dateComponents) {
            this.logger.warn('No Datum found in [info] section, skipping data');
            continue;
          }

          const dto = this.transformRowToDTO(
            trimmedLine,
            headers,
            dateComponents,
            loggerId,
          );
          if (dto) {
            dataRowCount++;
            yield dto;
          }
          break;
        }

        default:
          // Before any section marker, ignore lines
          break;
      }
    }

    this.logger.log(`Parsed ${dataRowCount} data rows from Meteo Control file`);

    if (dataRowCount === 0) {
      throw new ParserError(
        this.name,
        'No valid data rows found. Check file format.',
      );
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
   * Transform a data row to UnifiedMeasurementDTO
   */
  private transformRowToDTO(
    line: string,
    headers: string[],
    dateComponents: DateComponents,
    loggerId: string,
  ): UnifiedMeasurementDTO | null {
    const values = line.split(';').map((v) => v.trim());

    if (values.length === 0) {
      return null;
    }

    // First column is Uhrzeit (time)
    const uhrzeitIndex = headers.indexOf('uhrzeit');
    const timeValue = uhrzeitIndex >= 0 ? values[uhrzeitIndex] : values[0];

    const timestamp = this.buildTimestamp(dateComponents, timeValue);
    if (!timestamp) {
      this.logger.warn(`Invalid time: ${timeValue}`);
      return null;
    }

    // Build DTO
    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId,
      loggerType: 'meteocontrol',
      activePowerWatts: null, // Not in analog files
      energyDailyKwh: null, // Not in analog files
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {};

    // Map values to headers
    for (let i = 0; i < headers.length && i < values.length; i++) {
      const header = headers[i];
      const numericValue = this.parseNumber(values[i]);

      // Skip non-data columns
      if (header === 'uhrzeit' || header === 'intervall') {
        if (header === 'intervall' && numericValue !== null) {
          metadata['intervalSeconds'] = numericValue;
        }
        continue;
      }

      // Check for primary irradiance sensor (G_M6)
      if (header === this.IRRADIANCE_COLUMN) {
        dto.irradiance = numericValue;
      } else {
        // All other columns go to metadata with normalized key
        const metaKey = this.normalizeFieldName(header);
        metadata[metaKey] = numericValue;
      }
    }

    dto.metadata = metadata;
    return dto;
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
   * Normalize field name for metadata storage
   * Converts G_M6 -> gM6, G_M10 -> gM10, etc.
   */
  private normalizeFieldName(name: string): string {
    if (!name) return '';

    // Convert to camelCase: g_m6 -> gM6
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
