import { PlexlogParser } from './plexlog.strategy';
import { collectDTOs } from '../../../test/utils/test-helpers';

/**
 * Mock better-sqlite3 module
 */
jest.mock('better-sqlite3', () => {
  return jest.fn().mockImplementation(() => mockDbInstance);
});

/**
 * Mock fs module for temp file operations
 */
jest.mock('node:fs', () => ({
  writeFileSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
}));

/**
 * Interface for accessing private methods in tests
 */
interface PlexlogParserPrivate {
  parseTimestamp(value: string): Date | null;
  parseNumber(value: string): number | null;
  normalizeFieldName(name: string): string;
  parseOptionalValue(value: string | null): Record<string, unknown>;
}

// Mock database instance
let mockDbInstance: {
  prepare: jest.Mock;
  close: jest.Mock;
};

// Mock statement
let mockStatement: {
  all: jest.Mock;
};

// Test data constants
const PLEXLOG_TIMESTAMP = '2025-10-13T10:55:00.0000000';
const PLEXLOG_TIMESTAMP_SHORT = '2025-10-13T10:55:00.000';

/**
 * Test data builders for Plexlog
 */
const plexlogData = {
  /** Inverter row with power and optional values */
  inverterRow: (
    id: number,
    power: number,
    timestamp = PLEXLOG_TIMESTAMP,
    optionalvalue?: string,
  ) => ({
    id_inverter: id,
    acproduction: power,
    timestamp,
    optionalvalue:
      optionalvalue ?? `T00:29.8;tot:381936;uac:235;p01:1843;u01:734`,
  }),

  /** Sensor row (irradiance) */
  sensorRow: (
    id: number,
    irradiance: number,
    timestamp = PLEXLOG_TIMESTAMP,
  ) => ({
    id_inverter: id,
    acproduction: irradiance,
    timestamp,
    optionalvalue: `tce:25.0;tex:20.0;wds:0.5`,
  }),

  /** Meter row with grid values */
  meterRow: (id: number, power: number, timestamp = PLEXLOG_TIMESTAMP) => ({
    id_inverter: id,
    acproduction: power,
    timestamp,
    optionalvalue: `exp:0.000;imp:0.000;frq:49.986;cos:1.000;ul1:20246;il1:0.000`,
  }),

  /** Row with null optionalvalue */
  minimalRow: (id: number, power: number, timestamp = PLEXLOG_TIMESTAMP) => ({
    id_inverter: id,
    acproduction: power,
    timestamp,
    optionalvalue: null,
  }),
};

/**
 * SQLite file magic bytes
 */
const SQLITE_MAGIC = 'SQLite format 3\0';

describe('PlexlogParser', () => {
  let parser: PlexlogParser;

  beforeEach(() => {
    parser = new PlexlogParser();

    // Reset mock statement
    mockStatement = {
      all: jest.fn(),
    };

    // Reset mock database instance
    mockDbInstance = {
      prepare: jest.fn().mockReturnValue(mockStatement),
      close: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should return true for data_*.s3db filename', () => {
      expect(parser.canHandle('data_02_10_2025_03_10.s3db', '')).toBe(true);
    });

    it('should return true for SQLite magic bytes', () => {
      expect(parser.canHandle('unknown.bin', SQLITE_MAGIC)).toBe(true);
    });

    it('should return false for config_*.s3db filename without magic bytes', () => {
      expect(parser.canHandle('config_02_10_2025_09_46.s3db', '')).toBe(false);
    });

    it('should return false for protocoll_*.s3db filename without magic bytes', () => {
      expect(parser.canHandle('protocoll_17_10_2025_09_56.s3db', '')).toBe(
        false,
      );
    });

    it('should return false for non-s3db files', () => {
      expect(parser.canHandle('data.csv', '')).toBe(false);
      expect(parser.canHandle('measurements.xml', '')).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse inverter data and yield DTOs', async () => {
      // Setup mock to return table list and data
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }]) // listTables
        .mockReturnValueOnce([
          plexlogData.inverterRow(11, 15757),
          plexlogData.inverterRow(12, 7448),
        ]); // queryData

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(2);

      // First inverter
      expect(results[0].loggerId).toBe('plexlog_11');
      expect(results[0].loggerType).toBe('plexlog');
      expect(results[0].activePowerWatts).toBe(15757);
      expect(results[0].irradiance).toBeNull();
      expect(results[0].timestamp).toEqual(new Date(PLEXLOG_TIMESTAMP_SHORT));

      // Second inverter
      expect(results[1].loggerId).toBe('plexlog_12');
      expect(results[1].activePowerWatts).toBe(7448);
    });

    it('should parse sensor data with irradiance', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([plexlogData.sensorRow(10, 850)]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('plexlog_10');
      expect(results[0].irradiance).toBe(850);
      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].metadata).toEqual({
        temperatureCell: 25.0,
        temperatureAmbient: 20.0,
        windSpeed: 0.5,
      });
    });

    it('should parse optionalvalue into semantic metadata', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([plexlogData.inverterRow(11, 15757)]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].metadata).toEqual({
        temperatureModule: 29.8,
        totalEnergyKwh: 381936,
        voltageAC: 235,
        dcPower1: 1843,
        dcVoltage1: 734,
      });
    });

    it('should handle rows with null optionalvalue', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([plexlogData.minimalRow(11, 5000)]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(5000);
      expect(results[0].metadata).toEqual({});
    });

    it('should throw ParserError for empty file', async () => {
      const buffer = Buffer.alloc(0);

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'File is empty',
      );
    });

    it('should throw ParserError for invalid SQLite file', async () => {
      const buffer = Buffer.from('Not a SQLite file', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'Invalid SQLite file format',
      );
    });

    it('should throw ParserError when tbl_inverterdata not found', async () => {
      mockStatement.all.mockReturnValueOnce([{ name: 'other_table' }]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        "Table 'tbl_inverterdata' not found",
      );
    });

    it('should throw ParserError when no data rows found', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No data rows found',
      );
    });

    it('should skip rows with invalid timestamps', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([
          plexlogData.inverterRow(11, 15757, 'invalid-timestamp'),
          plexlogData.inverterRow(12, 7448, PLEXLOG_TIMESTAMP),
        ]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('plexlog_12');
    });

    it('should close database after parsing', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([plexlogData.inverterRow(11, 1000)]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      await collectDTOs(parser.parse(buffer));

      expect(mockDbInstance.close).toHaveBeenCalled();
    });
  });

  describe('parseTimestamp', () => {
    const parseTimestamp = (value: string): Date | null => {
      return (parser as unknown as PlexlogParserPrivate).parseTimestamp(value);
    };

    it('should parse ISO 8601 timestamp with excess precision', () => {
      const result = parseTimestamp('2025-10-13T10:55:00.0000000');
      expect(result).toEqual(new Date('2025-10-13T10:55:00.000'));
    });

    it('should parse standard ISO timestamp', () => {
      const result = parseTimestamp('2025-10-13T10:55:00');
      expect(result).toEqual(new Date('2025-10-13T10:55:00'));
    });

    it('should return null for empty string', () => {
      expect(parseTimestamp('')).toBeNull();
    });

    it('should return null for invalid timestamp', () => {
      expect(parseTimestamp('not-a-date')).toBeNull();
    });
  });

  describe('parseNumber', () => {
    const parseNumber = (value: string): number | null => {
      return (parser as unknown as PlexlogParserPrivate).parseNumber(value);
    };

    it('should parse integer string', () => {
      expect(parseNumber('15757')).toBe(15757);
    });

    it('should parse decimal string', () => {
      expect(parseNumber('29.8')).toBe(29.8);
    });

    it('should handle comma decimal separator', () => {
      expect(parseNumber('29,8')).toBe(29.8);
    });

    it('should return null for empty string', () => {
      expect(parseNumber('')).toBeNull();
    });

    it('should return null for N/A', () => {
      expect(parseNumber('N/A')).toBeNull();
    });

    it('should normalize -0 to 0', () => {
      expect(parseNumber('-0')).toBe(0);
    });
  });

  describe('normalizeFieldName', () => {
    const normalizeFieldName = (name: string): string => {
      return (parser as unknown as PlexlogParserPrivate).normalizeFieldName(
        name,
      );
    };

    it('should translate known fields to semantic names', () => {
      expect(normalizeFieldName('tot')).toBe('totalEnergyKwh');
      expect(normalizeFieldName('uac')).toBe('voltageAC');
      expect(normalizeFieldName('rpw')).toBe('reactivePowerVar');
      expect(normalizeFieldName('tce')).toBe('temperatureCell');
      expect(normalizeFieldName('tex')).toBe('temperatureAmbient');
      expect(normalizeFieldName('wds')).toBe('windSpeed');
      expect(normalizeFieldName('frq')).toBe('gridFrequencyHz');
      expect(normalizeFieldName('cos')).toBe('powerFactor');
    });

    it('should translate numbered DC fields', () => {
      expect(normalizeFieldName('p01')).toBe('dcPower1');
      expect(normalizeFieldName('p09')).toBe('dcPower9');
      expect(normalizeFieldName('u01')).toBe('dcVoltage1');
      expect(normalizeFieldName('u05')).toBe('dcVoltage5');
    });

    it('should handle uppercase input', () => {
      expect(normalizeFieldName('TOT')).toBe('totalEnergyKwh');
      expect(normalizeFieldName('P01')).toBe('dcPower1');
    });

    it('should handle T00 as temperatureModule', () => {
      expect(normalizeFieldName('t00')).toBe('temperatureModule');
    });

    it('should fallback to camelCase for unknown fields', () => {
      expect(normalizeFieldName('custom_field')).toBe('customField');
      expect(normalizeFieldName('some-value')).toBe('someValue');
    });

    it('should return empty string for empty input', () => {
      expect(normalizeFieldName('')).toBe('');
    });
  });

  describe('parseOptionalValue', () => {
    const parseOptionalValue = (
      value: string | null,
    ): Record<string, unknown> => {
      return (parser as unknown as PlexlogParserPrivate).parseOptionalValue(
        value,
      );
    };

    it('should parse key:value pairs separated by semicolons', () => {
      const result = parseOptionalValue('tot:100;uac:235;rpw:50');
      expect(result).toEqual({
        totalEnergyKwh: 100,
        voltageAC: 235,
        reactivePowerVar: 50,
      });
    });

    it('should handle temperature with decimal', () => {
      const result = parseOptionalValue('T00:29.8;tce:17.5');
      expect(result).toEqual({
        temperatureModule: 29.8,
        temperatureCell: 17.5,
      });
    });

    it('should parse DC power and voltage fields', () => {
      const result = parseOptionalValue('p01:1843;u01:734;p02:1658;u02:690');
      expect(result).toEqual({
        dcPower1: 1843,
        dcVoltage1: 734,
        dcPower2: 1658,
        dcVoltage2: 690,
      });
    });

    it('should return empty object for null input', () => {
      expect(parseOptionalValue(null)).toEqual({});
    });

    it('should return empty object for empty string', () => {
      expect(parseOptionalValue('')).toEqual({});
    });

    it('should skip malformed pairs without colon', () => {
      const result = parseOptionalValue('tot:100;invalid;uac:235');
      expect(result).toEqual({
        totalEnergyKwh: 100,
        voltageAC: 235,
      });
    });

    it('should handle negative values', () => {
      const result = parseOptionalValue('rpw:-593');
      expect(result).toEqual({
        reactivePowerVar: -593,
      });
    });

    it('should handle zero values', () => {
      const result = parseOptionalValue('bat:0;chr:0');
      expect(result).toEqual({
        batteryValue: 0,
        chargeValue: 0,
      });
    });
  });

  describe('metadata field translation', () => {
    it('should translate all grid meter fields', async () => {
      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([plexlogData.meterRow(2, 0)]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].metadata).toEqual({
        energyExportKwh: 0,
        energyImportKwh: 0,
        gridFrequencyHz: 49.986,
        powerFactor: 1,
        voltageL1: 20246,
        currentL1: 0,
      });
    });

    it('should handle complex inverter optionalvalue', async () => {
      const complexOptional =
        'T00:30.7;tot:342804;uac:234;bat:0;chr:0;rpw:97;p01:1640;u01:724;p02:1713;u02:721';

      mockStatement.all
        .mockReturnValueOnce([{ name: 'tbl_inverterdata' }])
        .mockReturnValueOnce([
          {
            id_inverter: 13,
            acproduction: 15679,
            timestamp: PLEXLOG_TIMESTAMP,
            optionalvalue: complexOptional,
          },
        ]);

      const buffer = Buffer.from(SQLITE_MAGIC + 'dummy content', 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(15679);
      expect(results[0].metadata).toEqual({
        temperatureModule: 30.7,
        totalEnergyKwh: 342804,
        voltageAC: 234,
        batteryValue: 0,
        chargeValue: 0,
        reactivePowerVar: 97,
        dcPower1: 1640,
        dcVoltage1: 724,
        dcPower2: 1713,
        dcVoltage2: 721,
      });
    });
  });
});
