import { MbmetParser } from './mbmet.strategy';
import { collectDTOs } from '../../../test/utils/test-helpers';
import { mbmetCsv, MBMET_LOGGER_ID } from '../../../test/utils/mock-data';

interface MbmetParserPrivate {
  parseTimestamp(value: string): Date | null;
  parseNumber(value: string): number | null;
  normalizeFieldName(name: string): string;
  extractLoggerId(filename: string): string;
}

describe('MbmetParser', () => {
  let parser: MbmetParser;

  beforeEach(() => {
    parser = new MbmetParser();
  });

  describe('canHandle', () => {
    it('should return true for filename containing mbmet', () => {
      expect(parser.canHandle('mbmet_data.csv', '')).toBe(true);
    });

    it('should return true for filename containing einstrahlung', () => {
      expect(parser.canHandle('einstrahlung_838176578.csv', '')).toBe(true);
    });

    it('should return true for content with Zeitstempel and Einstrahlung', () => {
      expect(
        parser.canHandle(
          'unknown.csv',
          'Zeitstempel,Einstrahlung (Einstrahlung West)',
        ),
      ).toBe(true);
    });

    it('should return false for unrelated file', () => {
      expect(parser.canHandle('goodwe_data.csv', 'timestamp,P_AC')).toBe(false);
    });

    it('should be case insensitive for filename', () => {
      expect(parser.canHandle('MBMET_DATA.CSV', '')).toBe(true);
      expect(parser.canHandle('Einstrahlung_123.csv', '')).toBe(true);
    });

    it('should store filename for later loggerId extraction', () => {
      parser.canHandle('einstrahlung_838176578.csv', '');
      // Verify by parsing - loggerId should be extracted
      const buffer = Buffer.from(mbmetCsv.simple(500), 'utf-8');
      return collectDTOs(parser.parse(buffer)).then((results) => {
        expect(results[0].loggerId).toBe('838176578');
      });
    });
  });

  describe('parse - Basic Functionality', () => {
    beforeEach(() => {
      parser.canHandle(`einstrahlung_${MBMET_LOGGER_ID}.csv`, '');
    });

    it('should parse single row with irradiance', async () => {
      const buffer = Buffer.from(mbmetCsv.simple(500.5), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe(MBMET_LOGGER_ID);
      expect(results[0].loggerType).toBe('mbmet');
      expect(results[0].irradiance).toBe(500.5);
    });

    it('should parse timestamp with underscores correctly', async () => {
      const buffer = Buffer.from(mbmetCsv.simple(100), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].timestamp.toISOString()).toBe(
        '2025-09-30T23:42:27.000Z',
      );
    });

    it('should not set activePowerWatts or energyDailyKwh', async () => {
      const buffer = Buffer.from(mbmetCsv.simple(100), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBeNull();
    });

    it('should skip units row', async () => {
      const buffer = Buffer.from(mbmetCsv.simple(100), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      // Should only have 1 data row, units row skipped
      expect(results).toHaveLength(1);
    });
  });

  describe('parse - Metadata', () => {
    beforeEach(() => {
      parser.canHandle(`einstrahlung_${MBMET_LOGGER_ID}.csv`, '');
    });

    it('should store temperature fields in metadata with semantic English names', async () => {
      const buffer = Buffer.from(
        mbmetCsv.withAllValues({
          irradianceWest: 500,
          tZelleWest: 25.5,
          tUmgebungWest: 22.3,
          irradianceOst: 480,
          tZelleOst: 26.1,
          tUmgebungOst: 21.8,
        }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].irradiance).toBe(500);
      // German -> English translations applied
      expect(results[0].metadata).toHaveProperty('cellTemperatureWest', 25.5);
      expect(results[0].metadata).toHaveProperty(
        'ambientTemperatureWest',
        22.3,
      );
      expect(results[0].metadata).toHaveProperty('irradianceEast', 480);
      expect(results[0].metadata).toHaveProperty('cellTemperatureEast', 26.1);
      expect(results[0].metadata).toHaveProperty(
        'ambientTemperatureEast',
        21.8,
      );
    });

    it('should store East irradiance in metadata, not golden metric', async () => {
      const buffer = Buffer.from(
        mbmetCsv.withAllValues({
          irradianceWest: 500,
          tZelleWest: 25,
          tUmgebungWest: 22,
          irradianceOst: 600,
          tZelleOst: 26,
          tUmgebungOst: 21,
        }),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      // West is golden metric
      expect(results[0].irradiance).toBe(500);
      // East is in metadata with English name
      expect(results[0].metadata).toHaveProperty('irradianceEast', 600);
    });
  });

  describe('parse - Multiple Rows', () => {
    beforeEach(() => {
      parser.canHandle(`einstrahlung_${MBMET_LOGGER_ID}.csv`, '');
    });

    it('should parse multiple data rows', async () => {
      const buffer = Buffer.from(
        mbmetCsv.multipleRows([
          { ts: '2025_09_30 10:00:00', irradianceWest: 100 },
          { ts: '2025_09_30 10:05:00', irradianceWest: 150 },
          { ts: '2025_09_30 10:10:00', irradianceWest: 200 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(3);
      expect(results[0].irradiance).toBe(100);
      expect(results[1].irradiance).toBe(150);
      expect(results[2].irradiance).toBe(200);
    });

    it('should parse timestamps in order', async () => {
      const buffer = Buffer.from(
        mbmetCsv.multipleRows([
          { ts: '2025_09_30 10:00:00', irradianceWest: 100 },
          { ts: '2025_09_30 10:05:00', irradianceWest: 150 },
        ]),
        'utf-8',
      );
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].timestamp.toISOString()).toBe(
        '2025-09-30T10:00:00.000Z',
      );
      expect(results[1].timestamp.toISOString()).toBe(
        '2025-09-30T10:05:00.000Z',
      );
    });
  });

  describe('parse - loggerId Extraction', () => {
    it('should extract loggerId from filename', async () => {
      parser.canHandle('einstrahlung_12345.csv', '');
      const buffer = Buffer.from(mbmetCsv.simple(100), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].loggerId).toBe('12345');
    });

    it('should use MBMET_Unknown when no digits in filename', async () => {
      parser.canHandle('meteo_data.csv', 'Zeitstempel,Einstrahlung');
      const buffer = Buffer.from(mbmetCsv.simple(100), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].loggerId).toBe('MBMET_Unknown');
    });

    it('should handle long numeric IDs', async () => {
      parser.canHandle('einstrahlung_838176578123.csv', '');
      const buffer = Buffer.from(mbmetCsv.simple(100), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].loggerId).toBe('838176578123');
    });
  });

  describe('parse - Edge Cases', () => {
    beforeEach(() => {
      parser.canHandle(`einstrahlung_${MBMET_LOGGER_ID}.csv`, '');
    });

    it('should handle zero irradiance', async () => {
      const buffer = Buffer.from(mbmetCsv.simple(0), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].irradiance).toBe(0);
    });

    it('should handle decimal values', async () => {
      const buffer = Buffer.from(mbmetCsv.simple(123.456), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].irradiance).toBe(123.456);
    });

    it('should handle CSV without units row', async () => {
      const buffer = Buffer.from(mbmetCsv.withoutUnits(500), 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].irradiance).toBe(500);
    });
  });

  describe('parse - Error Handling', () => {
    beforeEach(() => {
      parser.canHandle(`einstrahlung_${MBMET_LOGGER_ID}.csv`, '');
    });

    it('should throw ParserError for empty file', async () => {
      const buffer = Buffer.from(mbmetCsv.empty(), 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No data rows found',
      );
    });

    it('should throw ParserError for headers only', async () => {
      const buffer = Buffer.from(mbmetCsv.headersOnly(), 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No valid data rows found',
      );
    });
  });

  describe('parseTimestamp (private method)', () => {
    const parseTimestamp = (value: string): Date | null => {
      return (parser as unknown as MbmetParserPrivate).parseTimestamp(value);
    };

    it('should parse "2025_09_30 14:30:45" correctly', () => {
      const result = parseTimestamp('2025_09_30 14:30:45');
      expect(result?.toISOString()).toBe('2025-09-30T14:30:45.000Z');
    });

    it('should handle leading/trailing spaces', () => {
      const result = parseTimestamp('  2025_09_30 14:30:45  ');
      expect(result?.toISOString()).toBe('2025-09-30T14:30:45.000Z');
    });

    it('should return null for empty string', () => {
      expect(parseTimestamp('')).toBeNull();
    });

    it('should return null for invalid format', () => {
      expect(parseTimestamp('2025/09/30 14:30:45')).toBeNull();
    });

    it('should handle midnight correctly', () => {
      const result = parseTimestamp('2025_09_30 00:00:00');
      expect(result?.toISOString()).toBe('2025-09-30T00:00:00.000Z');
    });
  });

  describe('extractLoggerId (private method)', () => {
    const extractLoggerId = (filename: string): string => {
      return (parser as unknown as MbmetParserPrivate).extractLoggerId(
        filename,
      );
    };

    it('should extract "838176578" from "einstrahlung_838176578.csv"', () => {
      expect(extractLoggerId('einstrahlung_838176578.csv')).toBe('838176578');
    });

    it('should extract "123" from "data_123.csv"', () => {
      expect(extractLoggerId('data_123.csv')).toBe('123');
    });

    it('should return MBMET_Unknown for no digits', () => {
      expect(extractLoggerId('data.csv')).toBe('MBMET_Unknown');
    });

    it('should be case insensitive', () => {
      expect(extractLoggerId('EINSTRAHLUNG_999.CSV')).toBe('999');
    });
  });

  describe('normalizeFieldName (private method)', () => {
    const normalizeFieldName = (name: string): string => {
      return (parser as unknown as MbmetParserPrivate).normalizeFieldName(name);
    };

    describe('Semantic Translation', () => {
      it('should translate "Einstrahlung (Einstrahlung Ost)" to "irradianceEast"', () => {
        expect(normalizeFieldName('Einstrahlung (Einstrahlung Ost)')).toBe(
          'irradianceEast',
        );
      });

      it('should translate "T_Zelle (Einstrahlung West)" to "cellTemperatureWest"', () => {
        expect(normalizeFieldName('T_Zelle (Einstrahlung West)')).toBe(
          'cellTemperatureWest',
        );
      });

      it('should translate "T_Umgebung (Einstrahlung Ost)" to "ambientTemperatureEast"', () => {
        expect(normalizeFieldName('T_Umgebung (Einstrahlung Ost)')).toBe(
          'ambientTemperatureEast',
        );
      });

      it('should translate "T_Zelle (Einstrahlung Ost)" to "cellTemperatureEast"', () => {
        expect(normalizeFieldName('T_Zelle (Einstrahlung Ost)')).toBe(
          'cellTemperatureEast',
        );
      });

      it('should translate "T_Umgebung (Einstrahlung West)" to "ambientTemperatureWest"', () => {
        expect(normalizeFieldName('T_Umgebung (Einstrahlung West)')).toBe(
          'ambientTemperatureWest',
        );
      });
    });

    describe('CamelCase Fallback', () => {
      it('should fallback to camelCase for unknown fields', () => {
        expect(normalizeFieldName('Temperature')).toBe('temperature');
      });

      it('should handle field without orientation', () => {
        expect(normalizeFieldName('Unknown_Field')).toBe('unknownField');
      });
    });
  });

  describe('parser metadata', () => {
    it('should have correct name', () => {
      expect(parser.name).toBe('mbmet');
    });

    it('should have correct description', () => {
      expect(parser.description).toBe('MBMET 501FB Meteo Station CSV Export');
    });
  });
});
