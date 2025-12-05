import { GoodWeParser } from './goodwe.strategy';
import { collectDTOs, parseAndCollect } from '../../../test/utils/test-helpers';
import {
  goodweCsv,
  GOODWE_TIMESTAMP,
  DEFAULT_LOGGER,
} from '../../../test/utils/mock-data';

/**
 * Interface exposing private methods for testing
 */
interface GoodWeParserPrivate {
  parseGoodWeCompactDate(raw: string): Date | null;
  parseTimestamp(value: string): Date | null;
  parseCustomFormat(
    value: string,
    pattern: RegExp,
    yearFirst: boolean,
  ): Date | null;
  findGoldenMetricMapping(key: string): string | null;
  parseNumber(value: unknown): number | null;
  normalizeFieldName(name: string): string;
  toSafeString(value: unknown): string;
  stripQuotes(value: string): string;
}

describe('GoodWeParser', () => {
  let parser: GoodWeParser;

  beforeEach(() => {
    parser = new GoodWeParser();
  });

  describe('parseGoodWeCompactDate', () => {
    // Access private method for focused unit testing
    const parseDate = (raw: string): Date | null => {
      return (parser as unknown as GoodWeParserPrivate).parseGoodWeCompactDate(
        raw,
      );
    };

    describe('valid dates', () => {
      it('should parse "20251001T020435" -> 2025-10-01T02:04:35Z', () => {
        const result = parseDate('20251001T020435');
        expect(result).not.toBeNull();
        expect(result!.toISOString()).toBe('2025-10-01T02:04:35.000Z');
      });

      it('should parse midnight "20230101T000000"', () => {
        const result = parseDate('20230101T000000');
        expect(result).not.toBeNull();
        expect(result!.toISOString()).toBe('2023-01-01T00:00:00.000Z');
      });

      it('should parse end of year "20231231T235959"', () => {
        const result = parseDate('20231231T235959');
        expect(result).not.toBeNull();
        expect(result!.toISOString()).toBe('2023-12-31T23:59:59.000Z');
      });

      it('should parse mid-day "20240615T143022"', () => {
        const result = parseDate('20240615T143022');
        expect(result).not.toBeNull();
        expect(result!.toISOString()).toBe('2024-06-15T14:30:22.000Z');
      });

      it('should parse February 29 on leap year "20240229T120000"', () => {
        const result = parseDate('20240229T120000');
        expect(result).not.toBeNull();
        expect(result!.toISOString()).toBe('2024-02-29T12:00:00.000Z');
      });
    });

    describe('invalid dates', () => {
      it('should return null for "invalid"', () => {
        const result = parseDate('invalid');
        expect(result).toBeNull();
      });

      it('should return null for empty string', () => {
        const result = parseDate('');
        expect(result).toBeNull();
      });

      it('should return null for wrong format "2025-10-01T02:04:35" (ISO format)', () => {
        const result = parseDate('2025-10-01T02:04:35');
        expect(result).toBeNull();
      });

      it('should return null for invalid month (13)', () => {
        const result = parseDate('20251301T120000');
        expect(result).toBeNull();
      });

      it('should return null for invalid month (00)', () => {
        const result = parseDate('20250001T120000');
        expect(result).toBeNull();
      });

      it('should return null for invalid day (32)', () => {
        const result = parseDate('20251032T120000');
        expect(result).toBeNull();
      });

      it('should return null for invalid day (00)', () => {
        const result = parseDate('20251000T120000');
        expect(result).toBeNull();
      });

      it('should return null for invalid hour (24)', () => {
        const result = parseDate('20251015T240000');
        expect(result).toBeNull();
      });

      it('should return null for invalid minute (60)', () => {
        const result = parseDate('20251015T126000');
        expect(result).toBeNull();
      });

      it('should return null for invalid second (60)', () => {
        const result = parseDate('20251015T125960');
        expect(result).toBeNull();
      });

      it('should return null for missing T separator', () => {
        const result = parseDate('20251001120000');
        expect(result).toBeNull();
      });

      it('should return null for lowercase t separator', () => {
        const result = parseDate('20251001t120000');
        expect(result).toBeNull();
      });

      it('should return null for truncated input', () => {
        const result = parseDate('20251001T1200');
        expect(result).toBeNull();
      });
    });
  });

  describe('Headerless CSV Parsing', () => {
    it('should pivot EAV rows into UnifiedMeasurementDTO', async () => {
      // CSV format: timestamp, loggerId, key, value
      const results = await parseAndCollect(parser, [
        goodweCsv.row('Active_power percent', '1500'),
        goodweCsv.row('E_Day', '5.5'),
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe(DEFAULT_LOGGER);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[0].energyDailyKwh).toBe(5.5);
    });

    it('should group multiple metrics by timestamp+loggerId', async () => {
      const results = await parseAndCollect(parser, [
        ...goodweCsv.rows([
          { key: 'pac', value: '1000' },
          { key: 'e_day', value: '3.2' },
          { key: 'irradiance', value: '850' },
        ]),
        ...goodweCsv.rows([
          { key: 'pac', value: '1200', ts: '20251001T110000' },
          { key: 'e_day', value: '4.1', ts: '20251001T110000' },
        ]),
      ]);

      // Should have 2 measurements (grouped by timestamp)
      expect(results).toHaveLength(2);

      // First measurement at 10:00
      const m1 = results.find(
        (r) => r.timestamp.toISOString() === '2025-10-01T10:00:00.000Z',
      );
      expect(m1).toBeDefined();
      expect(m1!.activePowerWatts).toBe(1000);
      expect(m1!.energyDailyKwh).toBe(3.2);
      expect(m1!.irradiance).toBe(850);

      // Second measurement at 11:00
      const m2 = results.find(
        (r) => r.timestamp.toISOString() === '2025-10-01T11:00:00.000Z',
      );
      expect(m2).toBeDefined();
      expect(m2!.activePowerWatts).toBe(1200);
      expect(m2!.energyDailyKwh).toBe(4.1);
    });

    it('should handle multiple loggers in same file', async () => {
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', '500', GOODWE_TIMESTAMP, 'LOGGER_AAA01'),
        goodweCsv.row('pac', '600', GOODWE_TIMESTAMP, 'LOGGER_BBB02'),
      ]);

      expect(results).toHaveLength(2);
      expect(
        results.map((r) => r.loggerId).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['LOGGER_AAA01', 'LOGGER_BBB02']);
    });

    it('should handle missing values gracefully', async () => {
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', ''),
        goodweCsv.row('e_day', 'N/A'),
        goodweCsv.row('irradiance', '-'),
      ]);

      expect(results).toHaveLength(1);
      // All should be null due to invalid values
      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBeNull();
      expect(results[0].irradiance).toBeNull();
    });

    it('should skip rows with invalid timestamps', async () => {
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', '1000', 'invalid_timestamp'),
        goodweCsv.row('pac', '1500'),
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should store unmapped fields in metadata', async () => {
      const results = await parseAndCollect(
        parser,
        goodweCsv.rows([
          { key: 'pac', value: '1000' },
          { key: 'voltage_dc1', value: '350' },
          { key: 'temperature', value: '45' },
        ]),
      );

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1000);
      // Metadata keys are normalized to lowercase without special chars
      expect(results[0].metadata).toHaveProperty('voltagedc1', 350);
      expect(results[0].metadata).toHaveProperty('temperature', 45);
    });

    it('should skip rows with short logger IDs (< 10 chars)', async () => {
      // Logger ID "ABC" is only 3 chars - should be skipped
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', '1000', GOODWE_TIMESTAMP, 'ABC'),
        goodweCsv.row('pac', '2000'), // Uses DEFAULT_LOGGER which is valid
      ]);

      // Only the second row with valid logger should be parsed
      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(2000);
    });

    it('should skip rows with numeric-only logger IDs', async () => {
      // Logger ID with only digits should be skipped (garbage from binary parsing)
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', '1000', GOODWE_TIMESTAMP, '123456789012'),
        goodweCsv.row('pac', '2000'), // Valid logger
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(2000);
    });

    it('should accept valid alphanumeric logger IDs', async () => {
      // Valid GoodWe logger ID: 16 chars, alphanumeric
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', '1500', GOODWE_TIMESTAMP, '9250KHTU22BP0338'),
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('9250KHTU22BP0338');
      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should skip rows with "unknown" logger ID', async () => {
      const results = await parseAndCollect(parser, [
        goodweCsv.row('pac', '1000', GOODWE_TIMESTAMP, 'unknown'),
        goodweCsv.row('pac', '2000'), // Valid logger
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(2000);
    });
  });

  describe('Golden Metric Mapping (findGoldenMetricMapping)', () => {
    // Access private method for focused unit testing
    const findMapping = (key: string): string | null => {
      return (parser as unknown as GoodWeParserPrivate).findGoldenMetricMapping(
        key,
      );
    };

    describe('activePowerWatts mapping', () => {
      it('should map "Active_power percent" -> activePowerWatts', () => {
        expect(findMapping('Active_power percent')).toBe('activePowerWatts');
      });

      it('should map "active_power" -> activePowerWatts', () => {
        expect(findMapping('active_power')).toBe('activePowerWatts');
      });

      it('should map "pac" -> activePowerWatts', () => {
        expect(findMapping('pac')).toBe('activePowerWatts');
      });

      it('should map "Pac(W)" -> activePowerWatts', () => {
        expect(findMapping('Pac(W)')).toBe('activePowerWatts');
      });

      it('should map "output_power" -> activePowerWatts', () => {
        expect(findMapping('output_power')).toBe('activePowerWatts');
      });

      it('should map "ACTIVE_POWER" (uppercase) -> activePowerWatts', () => {
        expect(findMapping('ACTIVE_POWER')).toBe('activePowerWatts');
      });

      it('should map "activepower" (no underscore) -> activePowerWatts', () => {
        expect(findMapping('activepower')).toBe('activePowerWatts');
      });
    });

    describe('energyDailyKwh mapping', () => {
      it('should map "e_day" -> energyDailyKwh', () => {
        expect(findMapping('e_day')).toBe('energyDailyKwh');
      });

      it('should map "E_Day" -> energyDailyKwh', () => {
        expect(findMapping('E_Day')).toBe('energyDailyKwh');
      });

      it('should map "today_energy" -> energyDailyKwh', () => {
        expect(findMapping('today_energy')).toBe('energyDailyKwh');
      });

      it('should map "daily_generation" -> energyDailyKwh', () => {
        expect(findMapping('daily_generation')).toBe('energyDailyKwh');
      });

      it('should map "eday(kwh)" -> energyDailyKwh', () => {
        expect(findMapping('eday(kwh)')).toBe('energyDailyKwh');
      });
    });

    describe('irradiance mapping', () => {
      it('should map "irradiance" -> irradiance', () => {
        expect(findMapping('irradiance')).toBe('irradiance');
      });

      it('should map "solar_irradiance" -> irradiance', () => {
        expect(findMapping('solar_irradiance')).toBe('irradiance');
      });

      it('should map "irradiance(w/m2)" -> irradiance', () => {
        expect(findMapping('irradiance(w/m2)')).toBe('irradiance');
      });
    });

    describe('unknown fields', () => {
      it('should return null for unknown keys', () => {
        expect(findMapping('voltage_dc1')).toBeNull();
      });

      it('should return null for "temperature"', () => {
        expect(findMapping('temperature')).toBeNull();
      });

      it('should return null for empty string', () => {
        expect(findMapping('')).toBeNull();
      });
    });
  });

  describe('canHandle', () => {
    it('should return true for filename containing "goodwe"', () => {
      expect(parser.canHandle('goodwe_export.csv', '')).toBe(true);
    });

    it('should return true for filename containing "GOODWE" (case insensitive)', () => {
      expect(parser.canHandle('GOODWE_DATA.csv', '')).toBe(true);
    });

    it('should return true for filename containing "sems"', () => {
      expect(parser.canHandle('sems_portal_export.csv', '')).toBe(true);
    });

    it('should return true for filename with GW serial pattern', () => {
      expect(parser.canHandle('GW12345678_data.csv', '')).toBe(true);
    });

    it('should return true for content containing "SEMS Portal"', () => {
      expect(parser.canHandle('data.csv', 'SEMS Portal Export\nTime,Pac')).toBe(
        true,
      );
    });

    it('should return true for content containing "Active_Power"', () => {
      expect(parser.canHandle('data.csv', 'Time,Active_Power,E_Day')).toBe(
        true,
      );
    });

    it('should return false for unrelated file', () => {
      expect(
        parser.canHandle('random_data.csv', 'column1,column2,column3'),
      ).toBe(false);
    });
  });

  describe('parseNumber', () => {
    const parseNumber = (value: unknown): number | null => {
      return (parser as unknown as GoodWeParserPrivate).parseNumber(value);
    };

    it('should parse numeric string "1500" -> 1500', () => {
      expect(parseNumber('1500')).toBe(1500);
    });

    it('should parse float string "5.5" -> 5.5', () => {
      expect(parseNumber('5.5')).toBe(5.5);
    });

    it('should parse number with unit "1500W" -> 1500', () => {
      expect(parseNumber('1500W')).toBe(1500);
    });

    it('should parse number with spaces " 1500 " -> 1500', () => {
      expect(parseNumber(' 1500 ')).toBe(1500);
    });

    it('should return null for "N/A"', () => {
      expect(parseNumber('N/A')).toBeNull();
    });

    it('should return null for "-"', () => {
      expect(parseNumber('-')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseNumber('')).toBeNull();
    });

    it('should return null for null', () => {
      expect(parseNumber(null)).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(parseNumber(undefined)).toBeNull();
    });

    it('should pass through numbers', () => {
      expect(parseNumber(42)).toBe(42);
    });

    it('should return null for NaN', () => {
      expect(parseNumber(Number.NaN)).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should throw ParserError for empty file', async () => {
      const buffer = Buffer.from('', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'File is empty or has no data rows',
      );
    });

    it('should throw ParserError for file with only whitespace', async () => {
      const buffer = Buffer.from('   \n   \n', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'File is empty or has no data rows',
      );
    });
  });

  describe('parseTimestamp (various date formats)', () => {
    const parseTimestamp = (value: string): Date | null => {
      return (parser as unknown as GoodWeParserPrivate).parseTimestamp(value);
    };

    it('should parse GoodWe compact format "20251001T020435"', () => {
      const result = parseTimestamp('20251001T020435');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2025-10-01T02:04:35.000Z');
    });

    it('should parse ISO format "2024-01-15T14:30:00Z"', () => {
      const result = parseTimestamp('2024-01-15T14:30:00Z');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-01-15T14:30:00.000Z');
    });

    it('should parse YYYY-MM-DD HH:mm:ss format', () => {
      const result = parseTimestamp('2024-01-15 14:30:00');
      expect(result).not.toBeNull();
      // Format parses correctly
      expect(result!.getUTCFullYear()).toBe(2024);
      expect(result!.getUTCMonth()).toBe(0); // January
      expect(result!.getUTCDate()).toBe(15);
    });

    it('should parse YYYY-MM-DD HH:mm format (no seconds)', () => {
      const result = parseTimestamp('2024-01-15 14:30:00');
      expect(result).not.toBeNull();
      expect(result!.getUTCFullYear()).toBe(2024);
    });

    it('should parse DD/MM/YYYY HH:mm:ss format', () => {
      const result = parseTimestamp('15/01/2024 14:30:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-01-15T14:30:00.000Z');
    });

    it('should parse DD-MM-YYYY HH:mm:ss format', () => {
      const result = parseTimestamp('15-01-2024 14:30:00');
      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-01-15T14:30:00.000Z');
    });

    it('should return null for empty string', () => {
      expect(parseTimestamp('')).toBeNull();
    });

    it('should return null for whitespace only', () => {
      expect(parseTimestamp('   ')).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(parseTimestamp('invalid-date')).toBeNull();
    });
  });

  describe('normalizeFieldName (TRANSLATION_MAP)', () => {
    const normalizeFieldName = (name: string): string => {
      return (parser as unknown as GoodWeParserPrivate).normalizeFieldName(
        name,
      );
    };

    it('should translate "vac" to "voltageAC"', () => {
      expect(normalizeFieldName('vac')).toBe('voltageAC');
    });

    it('should translate "VAC" to "voltageAC" (case insensitive)', () => {
      expect(normalizeFieldName('VAC')).toBe('voltageAC');
    });

    it('should translate "u_ac" to "voltageAC"', () => {
      expect(normalizeFieldName('u_ac')).toBe('voltageAC');
    });

    it('should translate "iac" to "currentAC"', () => {
      expect(normalizeFieldName('iac')).toBe('currentAC');
    });

    it('should translate "fac" to "frequency"', () => {
      expect(normalizeFieldName('fac')).toBe('frequency');
    });

    it('should translate "temp" to "temperature"', () => {
      expect(normalizeFieldName('temp')).toBe('temperature');
    });

    it('should translate "powerfactor" to "powerFactor"', () => {
      expect(normalizeFieldName('powerfactor')).toBe('powerFactor');
    });

    it('should translate "pf" to "powerFactor"', () => {
      expect(normalizeFieldName('pf')).toBe('powerFactor');
    });

    it('should convert unknown field to camelCase', () => {
      // First letter stays lowercase, subsequent words capitalize
      expect(normalizeFieldName('DC Voltage 1')).toBe('dCVoltage1');
    });

    it('should convert field with underscores to camelCase', () => {
      expect(normalizeFieldName('some_unknown_field')).toBe('someunknownfield');
    });

    it('should handle empty string', () => {
      expect(normalizeFieldName('')).toBe('');
    });
  });

  describe('toSafeString (private)', () => {
    const toSafeString = (value: unknown): string => {
      return (parser as unknown as GoodWeParserPrivate).toSafeString(value);
    };

    it('should return string as-is', () => {
      expect(toSafeString('hello')).toBe('hello');
    });

    it('should convert number to string', () => {
      expect(toSafeString(42)).toBe('42');
    });

    it('should convert boolean to string', () => {
      expect(toSafeString(true)).toBe('true');
      expect(toSafeString(false)).toBe('false');
    });

    it('should return empty string for objects', () => {
      expect(toSafeString({ key: 'value' })).toBe('');
    });

    it('should return empty string for null', () => {
      expect(toSafeString(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(toSafeString(undefined)).toBe('');
    });
  });

  describe('stripQuotes (private)', () => {
    const stripQuotes = (value: string): string => {
      return (parser as unknown as GoodWeParserPrivate).stripQuotes(value);
    };

    it('should strip double quotes', () => {
      expect(stripQuotes('"hello"')).toBe('hello');
    });

    it('should strip single quotes', () => {
      expect(stripQuotes("'hello'")).toBe('hello');
    });

    it('should strip multiple leading quotes', () => {
      expect(stripQuotes('""hello')).toBe('hello');
    });

    it('should strip multiple trailing quotes', () => {
      expect(stripQuotes('hello""')).toBe('hello');
    });

    it('should strip mixed quotes', () => {
      expect(stripQuotes('"\'hello\'"')).toBe('hello');
    });

    it('should return unchanged string without quotes', () => {
      expect(stripQuotes('hello')).toBe('hello');
    });

    it('should return empty string for quotes only', () => {
      expect(stripQuotes('""')).toBe('');
    });
  });

  describe('findGoldenMetricMapping (additional branches)', () => {
    const findMapping = (key: string): string | null => {
      return (parser as unknown as GoodWeParserPrivate).findGoldenMetricMapping(
        key,
      );
    };

    describe('key normalization branches', () => {
      it('should match "active power" (with space) -> activePowerWatts', () => {
        expect(findMapping('active power')).toBe('activePowerWatts');
      });

      it('should match "AC_POWER" (underscore) -> activePowerWatts', () => {
        expect(findMapping('AC_POWER')).toBe('activePowerWatts');
      });

      it('should match "power(w)" -> activePowerWatts', () => {
        expect(findMapping('power(w)')).toBe('activePowerWatts');
      });

      it('should match "daily energy" (with space) -> energyDailyKwh', () => {
        expect(findMapping('daily energy')).toBe('energyDailyKwh');
      });

      it('should match "energy today" -> energyDailyKwh', () => {
        expect(findMapping('energy today')).toBe('energyDailyKwh');
      });

      it('should match "e-day" (with hyphen) -> energyDailyKwh', () => {
        expect(findMapping('e-day')).toBe('energyDailyKwh');
      });

      it('should match "_e_day" (middle pattern) -> energyDailyKwh', () => {
        expect(findMapping('some_e_day_value')).toBe('energyDailyKwh');
      });

      it('should match "solar_irradiance" -> irradiance', () => {
        expect(findMapping('solar_irradiance')).toBe('irradiance');
      });

      it('should match "poa_irradiance" -> irradiance', () => {
        expect(findMapping('poa_irradiance')).toBe('irradiance');
      });
    });

    describe('partial match patterns', () => {
      it('should match keys containing "active" and "power"', () => {
        expect(findMapping('some_active_power_metric')).toBe(
          'activePowerWatts',
        );
      });

      it('should match keys starting with "pac("', () => {
        expect(findMapping('pac(kw)')).toBe('activePowerWatts');
      });

      it('should match keys starting with "eday("', () => {
        expect(findMapping('eday(mwh)')).toBe('energyDailyKwh');
      });

      it('should match "daily" + "energy" combination', () => {
        expect(findMapping('total_daily_energy_output')).toBe('energyDailyKwh');
      });

      it('should match keys containing "irradiance"', () => {
        expect(findMapping('module_irradiance_sensor')).toBe('irradiance');
      });
    });
  });
});
