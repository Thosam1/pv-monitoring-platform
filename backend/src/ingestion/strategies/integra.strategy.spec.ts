import { IntegraParser } from './integra.strategy';
import { collectDTOs } from '../../../test/utils/test-helpers';
import { integraXml, INTEGRA_SERIAL } from '../../../test/utils/mock-data';

interface IntegraParserPrivate {
  parseTimestamp(value: string | undefined): Date | null;
  processValue(rawValue: string | undefined): number | string | null;
  normalizeFieldName(name: string): string;
}

describe('IntegraParser', () => {
  let parser: IntegraParser;

  beforeEach(() => {
    parser = new IntegraParser();
  });

  describe('canHandle', () => {
    it('should return true for .xml file with <root> tag', () => {
      expect(parser.canHandle('data.xml', '<?xml version="1.0"?><root>')).toBe(
        true,
      );
    });

    it('should return true for .xml file with meteocontrol reference', () => {
      expect(
        parser.canHandle('test.xml', 'xmlns="http://www.meteocontrol.de"'),
      ).toBe(true);
    });

    it('should return true for .xml file with <system> tag', () => {
      expect(parser.canHandle('export.xml', '<system interval="900">')).toBe(
        true,
      );
    });

    it('should return false for .csv file even with root tag', () => {
      expect(parser.canHandle('data.csv', '<root>')).toBe(false);
    });

    it('should return false for .xml file without matching content', () => {
      expect(parser.canHandle('config.xml', '<configuration>')).toBe(false);
    });

    it('should be case insensitive for extension', () => {
      expect(parser.canHandle('DATA.XML', '<root>')).toBe(true);
    });
  });

  describe('parse - Basic Functionality', () => {
    it('should parse single inverter with P_AC', async () => {
      const buffer = Buffer.from(integraXml.simple(1500), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe(INTEGRA_SERIAL);
      expect(results[0].loggerType).toBe('integra');
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
    });

    it('should parse multiple golden metrics', async () => {
      const buffer = Buffer.from(
        integraXml.withMetrics({
          P_AC: '2500',
          E_DAY: '12.5',
        }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(2500);
      expect(results[0].energyDailyKwh).toBe(12.5);
      expect(results[0].irradiance).toBeNull();
    });

    it('should store unmapped fields in metadata with normalized keys', async () => {
      const buffer = Buffer.from(
        integraXml.withMetrics({
          P_AC: '1000',
          F_AC: '50.02',
          I_AC1: '4.5',
          E_TOTAL: '12345',
        }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(1000);
      // New normalized key names for frontend compatibility
      expect(results[0].metadata).toHaveProperty('frequency', 50.02);
      expect(results[0].metadata).toHaveProperty('currentAC', 4.5);
      expect(results[0].metadata).toHaveProperty('energyTotal', 12345);
    });

    it('should include inverterType in metadata', async () => {
      const buffer = Buffer.from(integraXml.simple(1000), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].metadata).toHaveProperty('inverterType', 'SG36KTL-M');
    });
  });

  describe('parse - Multiple Records', () => {
    it('should parse multiple inverters at same timestamp', async () => {
      const buffer = Buffer.from(
        integraXml.multipleInverters([
          { serial: 'INV001', pAc: 1000 },
          { serial: 'INV002', pAc: 1500 },
          { serial: 'INV003', pAc: 2000 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(3);
      expect(results.map((r) => r.loggerId).sort()).toEqual([
        'INV001',
        'INV002',
        'INV003',
      ]);
      expect(
        results.find((r) => r.loggerId === 'INV001')?.activePowerWatts,
      ).toBe(1000);
      expect(
        results.find((r) => r.loggerId === 'INV002')?.activePowerWatts,
      ).toBe(1500);
      expect(
        results.find((r) => r.loggerId === 'INV003')?.activePowerWatts,
      ).toBe(2000);
    });

    it('should parse multiple data points (timestamps)', async () => {
      const buffer = Buffer.from(
        integraXml.multipleDataPoints([
          { ts: '2025-10-01 10:00:00', serial: 'INV001', pAc: 1000 },
          { ts: '2025-10-01 10:05:00', serial: 'INV001', pAc: 1100 },
          { ts: '2025-10-01 10:10:00', serial: 'INV001', pAc: 1200 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(3);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
      expect(results[1].timestamp.toISOString()).toBe(
        '2025-10-01T10:05:00.000Z',
      );
      expect(results[2].timestamp.toISOString()).toBe(
        '2025-10-01T10:10:00.000Z',
      );
      expect(results[0].activePowerWatts).toBe(1000);
      expect(results[1].activePowerWatts).toBe(1100);
      expect(results[2].activePowerWatts).toBe(1200);
    });

    it('should skip powermanagement elements', async () => {
      const buffer = Buffer.from(integraXml.withPowerManagement(1500), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe(INTEGRA_SERIAL);
      expect(results[0].activePowerWatts).toBe(1500);
    });
  });

  describe('parse - Special Value Handling', () => {
    it('should handle ": --" error values as null', async () => {
      const buffer = Buffer.from(integraXml.withErrors(), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].metadata).toHaveProperty('errorStatus', null);
    });

    it('should strip ": " prefix from state values', async () => {
      const buffer = Buffer.from(integraXml.withErrors(), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].metadata).toHaveProperty('inverterState', 'Run');
    });

    it('should parse zero as 0, not null', async () => {
      const buffer = Buffer.from(
        integraXml.withMetrics({ P_AC: '0' }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(0);
    });

    it('should handle empty string as null', async () => {
      const buffer = Buffer.from(integraXml.withMetrics({ P_AC: '' }), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBeNull();
    });

    it('should parse decimal values correctly', async () => {
      const buffer = Buffer.from(
        integraXml.withMetrics({ E_DAY: '15.75' }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].energyDailyKwh).toBe(15.75);
    });
  });

  describe('parse - Error Handling', () => {
    it('should throw ParserError for invalid XML', async () => {
      const buffer = Buffer.from('not valid xml <broken', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'Invalid XML',
      );
    });

    it('should throw ParserError for XML without data points', async () => {
      const buffer = Buffer.from('<?xml version="1.0"?><root></root>', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No data points found',
      );
    });

    it('should throw ParserError when no valid records found', async () => {
      const xml = [
        '<?xml version="1.0"?>',
        '<root><system><md>',
        '<dp timestamp="invalid-timestamp">',
        '<inverter serial="INV001"><mv type="P_AC">100</mv></inverter>',
        '</dp>',
        '</md></system></root>',
      ].join('');
      const buffer = Buffer.from(xml, 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No valid inverter records',
      );
    });
  });

  describe('parseTimestamp (private method)', () => {
    const parseTimestamp = (value: string | undefined): Date | null => {
      return (parser as unknown as IntegraParserPrivate).parseTimestamp(value);
    };

    it('should parse "2025-10-01 14:30:45" correctly', () => {
      const result = parseTimestamp('2025-10-01 14:30:45');
      expect(result?.toISOString()).toBe('2025-10-01T14:30:45.000Z');
    });

    it('should parse timestamp with leading/trailing spaces', () => {
      const result = parseTimestamp('  2025-10-01 14:30:45  ');
      expect(result?.toISOString()).toBe('2025-10-01T14:30:45.000Z');
    });

    it('should return null for undefined', () => {
      expect(parseTimestamp(undefined)).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(parseTimestamp('2025/10/01 14:30:45')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseTimestamp('')).toBeNull();
    });

    it('should handle midnight correctly', () => {
      const result = parseTimestamp('2025-10-01 00:00:00');
      expect(result?.toISOString()).toBe('2025-10-01T00:00:00.000Z');
    });
  });

  describe('processValue (private method)', () => {
    const processValue = (
      value: string | undefined,
    ): number | string | null => {
      return (parser as unknown as IntegraParserPrivate).processValue(value);
    };

    it('should parse "1500" as 1500', () => {
      expect(processValue('1500')).toBe(1500);
    });

    it('should parse "12.5" as 12.5', () => {
      expect(processValue('12.5')).toBe(12.5);
    });

    it('should parse "0" as 0', () => {
      expect(processValue('0')).toBe(0);
    });

    it('should return null for ": --"', () => {
      expect(processValue(': --')).toBeNull();
    });

    it('should return null for "--"', () => {
      expect(processValue('--')).toBeNull();
    });

    it('should strip ": " prefix and return string', () => {
      expect(processValue(': Run')).toBe('Run');
    });

    it('should strip ": " prefix for Stop state', () => {
      expect(processValue(': Stop')).toBe('Stop');
    });

    it('should return null for empty string', () => {
      expect(processValue('')).toBeNull();
    });

    it('should return null for undefined', () => {
      expect(processValue(undefined)).toBeNull();
    });

    it('should handle negative numbers', () => {
      expect(processValue('-100')).toBe(-100);
    });
  });

  describe('normalizeFieldName (private method)', () => {
    const normalizeFieldName = (name: string): string => {
      return (parser as unknown as IntegraParserPrivate).normalizeFieldName(
        name,
      );
    };

    it('should convert "I_AC1" to "iAc1"', () => {
      expect(normalizeFieldName('I_AC1')).toBe('iAc1');
    });

    it('should convert "E_TOTAL" to "eTotal"', () => {
      expect(normalizeFieldName('E_TOTAL')).toBe('eTotal');
    });

    it('should convert "P_AC" to "pAc"', () => {
      expect(normalizeFieldName('P_AC')).toBe('pAc');
    });

    it('should convert "U_DC1" to "uDc1"', () => {
      expect(normalizeFieldName('U_DC1')).toBe('uDc1');
    });

    it('should handle already lowercase', () => {
      expect(normalizeFieldName('state')).toBe('state');
    });

    it('should handle multiple underscores', () => {
      expect(normalizeFieldName('R_ISO')).toBe('rIso');
    });
  });

  describe('parser metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('integra');
    });

    it('should have correct description', () => {
      expect(parser.description).toBe(
        'Integra Sun XML Export (Meteocontrol format)',
      );
    });
  });
});
