import { GoodWeParser } from './goodwe.strategy';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

/**
 * Interface exposing private methods for testing
 */
interface GoodWeParserPrivate {
  parseGoodWeCompactDate(raw: string): Date | null;
  findGoldenMetricMapping(key: string): string | null;
  parseNumber(value: unknown): number | null;
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
    /**
     * Helper to collect all DTOs from async generator
     */
    async function collectDTOs(
      generator: AsyncGenerator<UnifiedMeasurementDTO>,
    ): Promise<UnifiedMeasurementDTO[]> {
      const results: UnifiedMeasurementDTO[] = [];
      for await (const dto of generator) {
        results.push(dto);
      }
      return results;
    }

    it('should pivot EAV rows into UnifiedMeasurementDTO', async () => {
      // CSV format: timestamp, loggerId, key, value
      const csvContent = [
        '20251001T100000,LOGGER001,Active_power percent,1500',
        '20251001T100000,LOGGER001,E_Day,5.5',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('LOGGER001');
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[0].energyDailyKwh).toBe(5.5);
    });

    it('should group multiple metrics by timestamp+loggerId', async () => {
      const csvContent = [
        '20251001T100000,LOGGER001,pac,1000',
        '20251001T100000,LOGGER001,e_day,3.2',
        '20251001T100000,LOGGER001,irradiance,850',
        '20251001T110000,LOGGER001,pac,1200',
        '20251001T110000,LOGGER001,e_day,4.1',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

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
      const csvContent = [
        '20251001T100000,LOGGER_A,pac,500',
        '20251001T100000,LOGGER_B,pac,600',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(2);
      expect(
        results.map((r) => r.loggerId).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['LOGGER_A', 'LOGGER_B']);
    });

    it('should handle missing values gracefully', async () => {
      const csvContent = [
        '20251001T100000,LOGGER001,pac,',
        '20251001T100000,LOGGER001,e_day,N/A',
        '20251001T100000,LOGGER001,irradiance,-',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      // All should be null due to invalid values
      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBeNull();
      expect(results[0].irradiance).toBeNull();
    });

    it('should skip rows with invalid timestamps', async () => {
      const csvContent = [
        'invalid_timestamp,LOGGER001,pac,1000',
        '20251001T100000,LOGGER001,pac,1500',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should store unmapped fields in metadata', async () => {
      const csvContent = [
        '20251001T100000,LOGGER001,pac,1000',
        '20251001T100000,LOGGER001,voltage_dc1,350',
        '20251001T100000,LOGGER001,temperature,45',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1000);
      // Metadata keys are normalized to lowercase without special chars
      expect(results[0].metadata).toHaveProperty('voltagedc1', 350);
      expect(results[0].metadata).toHaveProperty('temperature', 45);
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
});
