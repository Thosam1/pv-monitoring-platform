import { MeierParser } from './meier.strategy';
import { collectDTOs } from '../../../test/utils/test-helpers';
import {
  meierCsv,
  MEIER_SERIAL,
  MEIER_TIMESTAMP,
} from '../../../test/utils/mock-data';

interface MeierParserPrivate {
  parseTimestamp(value: string): Date | null;
  parseNumber(value: string): number | null;
  normalizeFieldName(name: string): string;
  extractSerial(line: string): string;
}

describe('MeierParser', () => {
  let parser: MeierParser;

  beforeEach(() => {
    parser = new MeierParser();
  });

  describe('canHandle', () => {
    it('should return true for filename containing meier', () => {
      expect(parser.canHandle('meier_data.csv', '')).toBe(true);
    });

    it('should return true for filename containing meiernt', () => {
      expect(parser.canHandle('meiernt_export.csv', '')).toBe(true);
    });

    it('should return true for content starting with serial;', () => {
      expect(parser.canHandle('unknown.csv', 'serial; 080000891')).toBe(true);
    });

    it('should return false for unrelated file', () => {
      expect(parser.canHandle('goodwe_data.csv', 'timestamp,P_AC')).toBe(false);
    });

    it('should be case insensitive for filename', () => {
      expect(parser.canHandle('MEIER_DATA.CSV', '')).toBe(true);
      expect(parser.canHandle('Meier_export.csv', '')).toBe(true);
    });

    it('should be case insensitive for content detection', () => {
      expect(parser.canHandle('data.csv', 'SERIAL; 12345')).toBe(true);
    });
  });

  describe('parse - Basic Functionality', () => {
    it('should parse single row with power and energy', async () => {
      const buffer = Buffer.from(meierCsv.simple(1500, 5000), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe(MEIER_SERIAL);
      expect(results[0].loggerType).toBe('meier');
      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should extract loggerId from serial line', async () => {
      const buffer = Buffer.from(
        meierCsv.simple(100, 200, undefined, '12345678'),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].loggerId).toBe('12345678');
    });

    it('should not set irradiance (not in Meier data)', async () => {
      const buffer = Buffer.from(meierCsv.simple(100, 200), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].irradiance).toBeNull();
    });
  });

  describe('parse - Timestamp Parsing (CRITICAL)', () => {
    it('should parse "01.10.2025" as October 1st, NOT January 10th', async () => {
      const buffer = Buffer.from(
        meierCsv.simple(100, 200, '01.10.2025 01:50:00'),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      // October 1st, 2025 at 01:50:00 UTC
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T01:50:00.000Z',
      );
      expect(results[0].timestamp.getUTCMonth()).toBe(9); // 0-indexed: 9 = October
      expect(results[0].timestamp.getUTCDate()).toBe(1);
    });

    it('should parse "31.12.2025" as December 31st', async () => {
      const buffer = Buffer.from(
        meierCsv.simple(100, 200, '31.12.2025 23:59:59'),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].timestamp.toISOString()).toBe(
        '2025-12-31T23:59:59.000Z',
      );
    });

    it('should parse midnight correctly', async () => {
      const buffer = Buffer.from(
        meierCsv.simple(100, 200, '15.06.2025 00:00:00'),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].timestamp.toISOString()).toBe(
        '2025-06-15T00:00:00.000Z',
      );
    });

    it('should skip rows with invalid timestamps', async () => {
      const csv = [
        'serial; 12345',
        'usermail; test@test.com',
        'description; Test',
        '; GENERAL.Feed-In_Power; GENERAL.Yield',
        '; W; Wh',
        'invalid_timestamp; 100; 200',
        '01.10.2025 10:00:00; 150; 250',
      ].join('\n');
      const buffer = Buffer.from(csv, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(150);
    });
  });

  describe('parse - Unit Conversion (CRITICAL)', () => {
    it('should convert Yield from Wh to kWh (divide by 1000)', async () => {
      // 5000 Wh should become 5.0 kWh
      const buffer = Buffer.from(meierCsv.simple(0, 5000), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].energyDailyKwh).toBe(5.0);
    });

    it('should convert 1000 Wh to 1.0 kWh', async () => {
      const buffer = Buffer.from(meierCsv.simple(0, 1000), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].energyDailyKwh).toBe(1.0);
    });

    it('should convert 500 Wh to 0.5 kWh', async () => {
      const buffer = Buffer.from(meierCsv.simple(0, 500), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].energyDailyKwh).toBe(0.5);
    });

    it('should NOT convert Feed-In_Power (already in Watts)', async () => {
      const buffer = Buffer.from(meierCsv.simple(1500, 0), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should handle zero values correctly', async () => {
      const buffer = Buffer.from(meierCsv.simple(0, 0), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(0);
      expect(results[0].energyDailyKwh).toBe(0);
    });
  });

  describe('parse - Metadata', () => {
    it('should store unmapped columns in metadata', async () => {
      const buffer = Buffer.from(
        meierCsv.withAllValues({
          feedInPower: 1500,
          kostalFeedInPower: 1400,
          generatorPower: 1600,
          yieldWh: 5000,
        }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      // Golden metrics
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[0].energyDailyKwh).toBe(5.0);

      // Metadata - semantic translation applied
      expect(results[0].metadata).toHaveProperty('activePowerWatts', 1400); // Kostal.1.2.Feed-In_Power
      expect(results[0].metadata).toHaveProperty('generatorPower', 1600); // GENERAL.Generator_Power
    });

    it('should normalize metadata keys to camelCase', async () => {
      const buffer = Buffer.from(meierCsv.simple(100, 200), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      // Check metadata keys are camelCase (from Kostal.1.2.Feed-In_Power)
      const metadataKeys = Object.keys(results[0].metadata || {});
      for (const key of metadataKeys) {
        expect(key).not.toContain('.');
        expect(key).not.toContain('-');
        expect(key).not.toContain('_');
      }
    });
  });

  describe('parse - Multiple Rows', () => {
    it('should parse multiple data rows', async () => {
      const buffer = Buffer.from(
        meierCsv.multipleRows([
          { ts: '01.10.2025 10:00:00', feedInPower: 1000, yieldWh: 2000 },
          { ts: '01.10.2025 10:15:00', feedInPower: 1500, yieldWh: 2500 },
          { ts: '01.10.2025 10:30:00', feedInPower: 2000, yieldWh: 3000 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(3);
      expect(results[0].activePowerWatts).toBe(1000);
      expect(results[1].activePowerWatts).toBe(1500);
      expect(results[2].activePowerWatts).toBe(2000);
    });

    it('should parse timestamps in order', async () => {
      const buffer = Buffer.from(
        meierCsv.multipleRows([
          { ts: '01.10.2025 10:00:00', feedInPower: 100, yieldWh: 200 },
          { ts: '01.10.2025 10:15:00', feedInPower: 150, yieldWh: 250 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
      expect(results[1].timestamp.toISOString()).toBe(
        '2025-10-01T10:15:00.000Z',
      );
    });

    it('should convert energy for all rows', async () => {
      const buffer = Buffer.from(
        meierCsv.multipleRows([
          { ts: '01.10.2025 10:00:00', feedInPower: 0, yieldWh: 1000 },
          { ts: '01.10.2025 10:15:00', feedInPower: 0, yieldWh: 2000 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].energyDailyKwh).toBe(1.0);
      expect(results[1].energyDailyKwh).toBe(2.0);
    });
  });

  describe('parse - Edge Cases', () => {
    it('should handle decimal values', async () => {
      const csv = [
        `serial; ${MEIER_SERIAL}`,
        'usermail; test@test.com',
        'description; Test',
        '; GENERAL.Feed-In_Power; GENERAL.Yield',
        '; W; Wh',
        `${MEIER_TIMESTAMP}; 1234.56; 7890.12`,
      ].join('\n');
      const buffer = Buffer.from(csv, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(1234.56);
      expect(results[0].energyDailyKwh).toBeCloseTo(7.89012, 5);
    });

    it('should handle comma as decimal separator (German format)', async () => {
      const csv = [
        `serial; ${MEIER_SERIAL}`,
        'usermail; test@test.com',
        'description; Test',
        '; GENERAL.Feed-In_Power; GENERAL.Yield',
        '; W; Wh',
        `${MEIER_TIMESTAMP}; 1234,56; 7890,12`,
      ].join('\n');
      const buffer = Buffer.from(csv, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(1234.56);
    });

    it('should handle empty values gracefully', async () => {
      const csv = [
        `serial; ${MEIER_SERIAL}`,
        'usermail; test@test.com',
        'description; Test',
        '; GENERAL.Feed-In_Power; GENERAL.Yield',
        '; W; Wh',
        `${MEIER_TIMESTAMP}; ; `,
      ].join('\n');
      const buffer = Buffer.from(csv, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBeNull();
    });
  });

  describe('parse - Error Handling', () => {
    it('should throw ParserError for empty file', async () => {
      const buffer = Buffer.from(meierCsv.empty(), 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'File is empty',
      );
    });

    it('should throw ParserError for headers only (no data rows)', async () => {
      const buffer = Buffer.from(meierCsv.headersOnly(), 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No data rows found',
      );
    });

    it('should use default loggerId when serial line is malformed', async () => {
      const csv = [
        'malformed_line',
        'usermail; test@test.com',
        'description; Test',
        '; GENERAL.Feed-In_Power; GENERAL.Yield',
        '; W; Wh',
        `${MEIER_TIMESTAMP}; 100; 200`,
      ].join('\n');
      const buffer = Buffer.from(csv, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].loggerId).toBe('MEIER_Unknown');
    });
  });

  describe('parseTimestamp (private method)', () => {
    const parseTimestamp = (value: string): Date | null => {
      return (parser as unknown as MeierParserPrivate).parseTimestamp(value);
    };

    it('should parse "01.10.2025 01:50:00" as October 1st', () => {
      const result = parseTimestamp('01.10.2025 01:50:00');
      expect(result?.toISOString()).toBe('2025-10-01T01:50:00.000Z');
    });

    it('should parse "31.12.2025 23:59:59" as December 31st', () => {
      const result = parseTimestamp('31.12.2025 23:59:59');
      expect(result?.toISOString()).toBe('2025-12-31T23:59:59.000Z');
    });

    it('should parse "15.01.2025 12:30:00" as January 15th', () => {
      const result = parseTimestamp('15.01.2025 12:30:00');
      expect(result?.toISOString()).toBe('2025-01-15T12:30:00.000Z');
    });

    it('should return null for empty string', () => {
      expect(parseTimestamp('')).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(parseTimestamp('2025-10-01 01:50:00')).toBeNull(); // ISO format
      expect(parseTimestamp('10/01/2025 01:50:00')).toBeNull(); // US format
    });

    it('should return null for invalid day (32)', () => {
      expect(parseTimestamp('32.10.2025 01:50:00')).toBeNull();
    });

    it('should return null for invalid month (13)', () => {
      expect(parseTimestamp('01.13.2025 01:50:00')).toBeNull();
    });

    it('should return null for invalid hour (25)', () => {
      expect(parseTimestamp('01.10.2025 25:50:00')).toBeNull();
    });

    it('should handle leading/trailing spaces', () => {
      const result = parseTimestamp('  01.10.2025 01:50:00  ');
      expect(result?.toISOString()).toBe('2025-10-01T01:50:00.000Z');
    });
  });

  describe('extractSerial (private method)', () => {
    const extractSerial = (line: string): string => {
      return (parser as unknown as MeierParserPrivate).extractSerial(line);
    };

    it('should extract "080000891" from "serial; 080000891"', () => {
      expect(extractSerial('serial; 080000891')).toBe('080000891');
    });

    it('should extract serial with different spacing', () => {
      expect(extractSerial('serial;080000891')).toBe('080000891');
      expect(extractSerial('serial;  080000891  ')).toBe('080000891');
    });

    it('should be case insensitive', () => {
      expect(extractSerial('SERIAL; 12345')).toBe('12345');
      expect(extractSerial('Serial; 12345')).toBe('12345');
    });

    it('should return MEIER_Unknown for malformed line', () => {
      expect(extractSerial('not_a_serial_line')).toBe('MEIER_Unknown');
      expect(extractSerial('serial')).toBe('MEIER_Unknown');
    });
  });

  describe('normalizeFieldName (private method)', () => {
    const normalizeFieldName = (name: string): string => {
      return (parser as unknown as MeierParserPrivate).normalizeFieldName(name);
    };

    describe('Semantic Translation', () => {
      it('should translate "T_Umgebung" to "ambientTemperature"', () => {
        expect(normalizeFieldName('T_Umgebung')).toBe('ambientTemperature');
      });

      it('should translate "T_Zelle" to "cellTemperature"', () => {
        expect(normalizeFieldName('T_Zelle')).toBe('cellTemperature');
      });

      it('should translate "GENERAL.Feed-In_Power" to "activePowerWatts"', () => {
        expect(normalizeFieldName('GENERAL.Feed-In_Power')).toBe(
          'activePowerWatts',
        );
      });

      it('should translate "Kostal.1.2.Yield" to "energyDailyKwh"', () => {
        expect(normalizeFieldName('Kostal.1.2.Yield')).toBe('energyDailyKwh');
      });

      it('should translate "GENERAL.Generator_Power" to "generatorPower"', () => {
        expect(normalizeFieldName('GENERAL.Generator_Power')).toBe(
          'generatorPower',
        );
      });

      it('should translate compound names like "Kostal.1.2.T_Umgebung"', () => {
        expect(normalizeFieldName('Kostal.1.2.T_Umgebung')).toBe(
          'ambientTemperature',
        );
      });

      it('should translate "WRTP2S9E.2.2110127233.Yield" to "energyDailyKwh"', () => {
        expect(normalizeFieldName('WRTP2S9E.2.2110127233.Yield')).toBe(
          'energyDailyKwh',
        );
      });
    });

    describe('CamelCase Fallback', () => {
      it('should fallback to camelCase for unknown fields', () => {
        expect(normalizeFieldName('Unknown.Field.Name')).toBe(
          'unknownFieldName',
        );
      });

      it('should handle single word', () => {
        expect(normalizeFieldName('Power')).toBe('power');
      });

      it('should handle empty string', () => {
        expect(normalizeFieldName('')).toBe('');
      });
    });
  });

  describe('parser metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('meier');
    });

    it('should have correct description', () => {
      expect(parser.description).toBe('Meier-NT Logger CSV Export');
    });
  });
});
