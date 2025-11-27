import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { IParser, ParserError } from '../interfaces/parser.interface';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * Integra Sun XML Parser Strategy (Meteocontrol format)
 *
 * Handles XML exports from Integra Sun / Meteocontrol monitoring systems.
 *
 * File Structure:
 * - Root <root> element with XSD namespace
 * - <system> contains interval, serial (system ID), and utcOffset
 * - <md> contains measurement data
 * - <dp timestamp="..."> are data points at specific times
 * - <inverter serial="..." type="..."> contains metrics for each inverter
 * - <mv type="KEY">value</mv> are measurement values
 *
 * Field Mapping (XML mv type -> Unified):
 * - P_AC -> activePowerWatts
 * - E_DAY -> energyDailyKwh
 * - All others -> metadata
 */
@Injectable()
export class IntegraParser implements IParser {
  private readonly logger = new Logger(IntegraParser.name);

  readonly name = 'integra';
  readonly description = 'Integra Sun XML Export (Meteocontrol format)';

  private readonly parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name: string) => ['dp', 'inverter', 'mv'].includes(name),
  };

  private readonly fieldMappings: Record<
    string,
    keyof Pick<
      UnifiedMeasurementDTO,
      'activePowerWatts' | 'energyDailyKwh' | 'irradiance'
    >
  > = {
    p_ac: 'activePowerWatts',
    e_day: 'energyDailyKwh',
    // Irradiance variants (plane of array, horizontal, module)
    g_poa: 'irradiance',
    g_hor: 'irradiance',
    g_m: 'irradiance',
    irradiance: 'irradiance',
  };

  /**
   * Metadata key mapping for frontend compatibility
   * Maps XML field names (lowercase) to normalized keys expected by frontend charts
   */
  private readonly metadataKeyMap: Record<string, string> = {
    // AC Voltage (3-phase)
    u_ac1: 'voltageAC',
    u_ac2: 'voltageAC2',
    u_ac3: 'voltageAC3',
    // DC Voltage (multiple strings)
    u_dc1: 'voltageDC',
    u_dc2: 'voltageDC2',
    u_dc3: 'voltageDC3',
    // AC Current (3-phase)
    i_ac1: 'currentAC',
    i_ac2: 'currentAC2',
    i_ac3: 'currentAC3',
    // DC Current
    i_dc1: 'currentDC',
    i_dc2: 'currentDC2',
    i_dc3: 'currentDC3',
    // Grid Frequency
    f_ac: 'frequency',
    // Additional metrics
    e_total: 'energyTotal',
    r_iso: 'insulationResistance',
    state: 'inverterState',
    error: 'errorStatus',
  };

  /**
   * Detect if this parser can handle the file
   *
   * Strict detection: requires .xml extension AND content signature
   */
  canHandle(filename: string, snippet: string): boolean {
    const isXml = /\.xml$/i.test(filename);
    if (!isXml) return false;

    const hasRootTag = snippet.includes('<root');
    const hasMeteocontrol = snippet.includes('meteocontrol');
    const hasSystemTag = snippet.includes('<system');

    return hasRootTag || hasMeteocontrol || hasSystemTag;
  }

  /**
   * Parse Integra Sun XML file
   *
   * Yields one DTO per inverter per timestamp
   */
  async *parse(fileBuffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO> {
    await Promise.resolve();

    const content = fileBuffer.toString('utf-8');
    const xmlParser = new XMLParser(this.parserOptions);

    let parsed: unknown;
    try {
      parsed = xmlParser.parse(content);
    } catch (error) {
      throw new ParserError(
        this.name,
        `Invalid XML: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const dataPoints = this.extractDataPoints(parsed);
    if (dataPoints.length === 0) {
      throw new ParserError(this.name, 'No data points found in XML');
    }

    let recordCount = 0;
    for (const dp of dataPoints) {
      const dpRecord = dp as Record<string, unknown>;
      const timestampAttr = dpRecord['@_timestamp'] as string | undefined;
      const timestamp = this.parseTimestamp(timestampAttr);
      if (!timestamp) {
        this.logger.warn(
          `Skipping dp with invalid timestamp: ${timestampAttr ?? 'undefined'}`,
        );
        continue;
      }

      const inverters = this.extractInverters(dp);
      for (const inverter of inverters) {
        const dto = this.transformInverterToDTO(inverter, timestamp);
        if (dto) {
          recordCount++;
          yield dto;
        }
      }
    }

    this.logger.log(`Parsed ${recordCount} records from Integra XML`);
    if (recordCount === 0) {
      throw new ParserError(this.name, 'No valid inverter records found');
    }
  }

  private extractDataPoints(parsed: unknown): unknown[] {
    const root = (parsed as Record<string, unknown>)?.root;
    const system = (root as Record<string, unknown>)?.system;
    const md = (system as Record<string, unknown>)?.md;
    const dp = (md as Record<string, unknown>)?.dp;

    if (!dp) return [];
    return Array.isArray(dp) ? dp : [dp];
  }

  private extractInverters(dp: unknown): unknown[] {
    const inverter = (dp as Record<string, unknown>)?.inverter;
    if (!inverter) return [];
    return Array.isArray(inverter) ? inverter : [inverter];
  }

  private parseTimestamp(value: string | undefined): Date | null {
    if (!value) return null;

    const match = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(
      value.trim(),
    );
    if (!match) return null;

    const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10) - 1;
    const day = Number.parseInt(dayStr, 10);
    const hour = Number.parseInt(hourStr, 10);
    const minute = Number.parseInt(minuteStr, 10);
    const second = Number.parseInt(secondStr, 10);

    const date = new Date(Date.UTC(year, month, day, hour, minute, second));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private transformInverterToDTO(
    inverter: unknown,
    timestamp: Date,
  ): UnifiedMeasurementDTO | null {
    const inv = inverter as Record<string, unknown>;
    const serial = inv['@_serial'] as string;

    if (!serial) {
      this.logger.warn('Inverter missing serial attribute');
      return null;
    }

    const dto: UnifiedMeasurementDTO = {
      timestamp,
      loggerId: serial,
      loggerType: 'integra',
      activePowerWatts: null,
      energyDailyKwh: null,
      irradiance: null,
      metadata: {},
    };

    const metadata: Record<string, unknown> = {
      inverterType: (inv['@_type'] as string) || null,
    };

    const mvElements = this.extractMvElements(inv);
    for (const mv of mvElements) {
      const mvRecord = mv as Record<string, unknown>;
      const type = (mvRecord['@_type'] as string)?.toLowerCase();
      const rawValue = mvRecord['#text'] as string;

      if (!type) continue;

      const processedValue = this.processValue(rawValue);
      const goldenField = this.fieldMappings[type];

      if (goldenField && typeof processedValue === 'number') {
        dto[goldenField] = processedValue;
      } else {
        // Use metadataKeyMap for frontend compatibility, fallback to camelCase
        const normalizedKey =
          this.metadataKeyMap[type] ?? this.normalizeFieldName(type);
        metadata[normalizedKey] = processedValue;
      }
    }

    // Calculate generator phase power from voltage and current
    this.calculateGeneratorPhasePower(metadata);

    dto.metadata = metadata;
    return dto;
  }

  private extractMvElements(inverter: Record<string, unknown>): unknown[] {
    const mv = inverter.mv;
    if (!mv) return [];
    return Array.isArray(mv) ? mv : [mv];
  }

  private processValue(rawValue: string | undefined): number | string | null {
    if (rawValue === undefined || rawValue === null) return null;

    const trimmed = String(rawValue).trim();

    if (trimmed === ': --' || trimmed === '--') {
      return null;
    }

    if (trimmed.startsWith(': ')) {
      return trimmed.substring(2);
    }

    if (trimmed === '') return null;
    const num = Number.parseFloat(trimmed);
    return Number.isNaN(num) ? trimmed : num;
  }

  private normalizeFieldName(name: string): string {
    return name
      .toLowerCase()
      .replaceAll(/_([a-z0-9])/g, (_, char: string) => char.toUpperCase());
  }

  /**
   * Calculate generator phase power from voltage and current
   * P = U × I (assumes power factor = 1, which is an approximation)
   */
  private calculateGeneratorPhasePower(
    metadata: Record<string, unknown>,
  ): void {
    const phases = [
      {
        voltage: 'voltageAC',
        current: 'currentAC',
        power: 'generatorPowerPhaseA',
      },
      {
        voltage: 'voltageAC2',
        current: 'currentAC2',
        power: 'generatorPowerPhaseB',
      },
      {
        voltage: 'voltageAC3',
        current: 'currentAC3',
        power: 'generatorPowerPhaseC',
      },
    ];

    let totalPower = 0;
    let hasAnyPhase = false;

    for (const phase of phases) {
      const voltage = metadata[phase.voltage];
      const current = metadata[phase.current];

      if (typeof voltage === 'number' && typeof current === 'number') {
        const phasePower = voltage * current;
        metadata[phase.power] = phasePower;
        totalPower += phasePower;
        hasAnyPhase = true;
      }
    }

    if (hasAnyPhase) {
      metadata['generatorPowerTotal'] = totalPower;
    }
  }
}
