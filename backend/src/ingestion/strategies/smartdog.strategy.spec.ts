import { SmartdogParser } from './smartdog.strategy';
import { parseAndCollect } from '../../../test/utils/test-helpers';
import { smartdogCsv, SMARTDOG_TIMESTAMP } from '../../../test/utils/mock-data';

describe('SmartdogParser', () => {
  let parser: SmartdogParser;

  beforeEach(() => {
    parser = new SmartdogParser();
  });

  describe('metadata', () => {
    it('has correct name and description', () => {
      expect(parser.name).toBe('smartdog');
      expect(parser.description).toBe('SmartDog Logger CSV Export');
    });
  });

  describe('canHandle', () => {
    describe('inverter files', () => {
      it('returns true for inverter global files with valid header', () => {
        const filename = 'B1_A1_S3_global_11_3_2025.txt';
        const snippet =
          'timestamp;address;bus;strings;stringid;pac;pdc;udc;temp\n1762152300;1;1;4;3;17;50;514;8';
        expect(parser.canHandle(filename, snippet)).toBe(true);
      });

      it('returns true for various bus/address/string combinations', () => {
        const snippet =
          'timestamp;address;bus;strings;stringid;pac;pdc;udc;temp\n';
        expect(
          parser.canHandle('B1_A9_S2_global_10_15_2025.txt', snippet),
        ).toBe(true);
        expect(parser.canHandle('B2_A5_S1_global_1_1_2024.txt', snippet)).toBe(
          true,
        );
        expect(
          parser.canHandle('B10_A20_S15_global_12_31_2025.txt', snippet),
        ).toBe(true);
      });

      it('returns true for prefixed filenames (from controller)', () => {
        const snippet =
          'timestamp;address;bus;strings;stringid;pac;pdc;udc;temp\n';
        expect(
          parser.canHandle('smartdog_B1_A1_S1_global_10_1_2025.txt', snippet),
        ).toBe(true);
        expect(
          parser.canHandle('smartdog_B1_A3_S6_global_11_4_2025.txt', snippet),
        ).toBe(true);
      });

      it('returns false for inverter file without valid header', () => {
        const filename = 'B1_A1_S3_global_11_3_2025.txt';
        const snippet = 'some,random,header\ndata';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });
    });

    describe('modbus sensor files', () => {
      it('returns true for modbustcpsensor files with valid header', () => {
        const filename = 'modbustcpsensor_1612427023_global_11_8_2025.txt';
        const snippet = 'timestamp;value\n1762556403;10309.168;-1';
        expect(parser.canHandle(filename, snippet)).toBe(true);
      });

      it('returns true for different sensor IDs', () => {
        const snippet = 'timestamp;value\n';
        expect(
          parser.canHandle(
            'modbustcpsensor_12345_global_1_1_2025.txt',
            snippet,
          ),
        ).toBe(true);
        expect(
          parser.canHandle(
            'modbustcpsensor_999999999_global_12_31_2025.txt',
            snippet,
          ),
        ).toBe(true);
      });

      it('returns true for prefixed filenames (from controller)', () => {
        const snippet = 'timestamp;value\n';
        expect(
          parser.canHandle(
            'smartdog_modbustcpsensor_1612427023_global_11_8_2025.txt',
            snippet,
          ),
        ).toBe(true);
      });

      it('returns false for modbustcpsensor without valid header', () => {
        const filename = 'modbustcpsensor_1612427023_global_11_8_2025.txt';
        const snippet = 'wrong;header\ndata';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });
    });

    describe('onewire sensor files', () => {
      it('returns true for onewire files with valid header', () => {
        const filename = 'onewire_1647527200_global_10_2_2025.txt';
        const snippet = 'timestamp;value\n1759381802;0.085;-1';
        expect(parser.canHandle(filename, snippet)).toBe(true);
      });

      it('returns true for prefixed filenames (from controller)', () => {
        const snippet = 'timestamp;value\n';
        expect(
          parser.canHandle(
            'smartdog_onewire_1647527200_global_10_2_2025.txt',
            snippet,
          ),
        ).toBe(true);
      });

      it('returns false for onewire without valid header', () => {
        const filename = 'onewire_1647527200_global_10_2_2025.txt';
        const snippet = 'invalid;columns\ndata';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });
    });

    describe('files to skip', () => {
      it('returns false for avg_day files', () => {
        const filename = 'B1_A1_S1_avg_day_10_2025.txt';
        const snippet = 'timestamp;address;bus;';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });

      it('returns false for avg_month files', () => {
        const filename = 'B1_A1_S1_avg_month_2025.txt';
        const snippet = 'timestamp;address;bus;';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });

      it('returns false for avg_year files', () => {
        const filename = 'B1_A7_S1_avg_year.txt';
        const snippet = 'year;address;bus;strings;stringid;produced_year';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });

      it('returns false for events files', () => {
        const filename = 'events_10_26_2025.txt';
        const snippet =
          'id;timestamp;bus;addresserrortype;errorcode;data;acknowleged';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });
    });

    describe('non-smartdog files', () => {
      it('returns false for GoodWe files', () => {
        const filename = 'goodwe_export.csv';
        const snippet = '20251001T100000,LOGGER001,pac,1000';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });

      it('returns false for LTI files', () => {
        const filename = 'lti_data.csv';
        const snippet = '[data]\ntimestamp;P_AC';
        expect(parser.canHandle(filename, snippet)).toBe(false);
      });
    });
  });

  describe('parse - Inverter Data', () => {
    beforeEach(() => {
      // Set up canHandle to store filename
      parser.canHandle(
        'B1_A3_S6_global_11_4_2025.txt',
        'timestamp;address;bus;strings;stringid;pac;pdc;udc;temp\n',
      );
    });

    it('parses inverter global file correctly', async () => {
      const lines = smartdogCsv.inverterSimple(500);
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(1);
      expect(results[0].loggerType).toBe('smartdog');
      expect(results[0].activePowerWatts).toBe(500);
    });

    it('constructs loggerId from filename pattern', async () => {
      const lines = smartdogCsv.inverterSimple(100);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].loggerId).toBe('SMARTDOG_B1_A3_S6');
    });

    it('maps pac to activePowerWatts', async () => {
      const lines = smartdogCsv.inverterFile([
        { ts: SMARTDOG_TIMESTAMP, pac: 1500 },
        { ts: SMARTDOG_TIMESTAMP + 300, pac: 2000 },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(2);
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[1].activePowerWatts).toBe(2000);
    });

    it('stores pdc, udc, temp in metadata with semantic names', async () => {
      const lines = smartdogCsv.inverterFile([
        { ts: SMARTDOG_TIMESTAMP, pac: 500, pdc: 550, udc: 600, temp: 35 },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].metadata).toMatchObject({
        dcPowerWatts: 550,
        voltageDC: 600, // Changed from dcVoltage for frontend compatibility
        inverterTemperature: 35,
      });
    });

    it('sets energyDailyKwh to null (not available)', async () => {
      const lines = smartdogCsv.inverterSimple(500);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].energyDailyKwh).toBeNull();
    });

    it('converts unix timestamp (seconds) to Date', async () => {
      const lines = smartdogCsv.inverterSimple(500, 1762152300);
      const results = await parseAndCollect(parser, lines);

      // 1762152300 seconds = some date in 2025
      const expectedDate = new Date(1762152300 * 1000);
      expect(results[0].timestamp).toEqual(expectedDate);
    });

    it('parses multiple rows correctly', async () => {
      const lines = smartdogCsv.inverterFile([
        { ts: 1762152300, pac: 100 },
        { ts: 1762152600, pac: 200 },
        { ts: 1762152900, pac: 300 },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(3);
      expect(results[0].activePowerWatts).toBe(100);
      expect(results[1].activePowerWatts).toBe(200);
      expect(results[2].activePowerWatts).toBe(300);
    });

    it('stores device metadata (address, bus, strings, stringid)', async () => {
      const lines = smartdogCsv.inverterFile([
        {
          ts: SMARTDOG_TIMESTAMP,
          pac: 500,
          address: 7,
          bus: 2,
          strings: 6,
          stringid: 4,
        },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].metadata).toMatchObject({
        deviceAddress: 7,
        busNumber: 2,
        stringCount: 6,
        stringId: 4,
      });
    });
  });

  describe('parse - Modbus Sensor', () => {
    beforeEach(() => {
      parser.canHandle(
        'modbustcpsensor_1612427023_global_11_8_2025.txt',
        'timestamp;value\n',
      );
    });

    it('parses modbustcpsensor file correctly', async () => {
      const lines = smartdogCsv.sensorSimple(850.5);
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(1);
      expect(results[0].loggerType).toBe('smartdog');
    });

    it('maps value to irradiance', async () => {
      const lines = smartdogCsv.sensorFile([
        { ts: SMARTDOG_TIMESTAMP, value: 850.5 },
        { ts: SMARTDOG_TIMESTAMP + 300, value: 920.3 },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].irradiance).toBe(850.5);
      expect(results[1].irradiance).toBe(920.3);
    });

    it('constructs loggerId as SMARTDOG_SENSOR_{id}', async () => {
      const lines = smartdogCsv.sensorSimple(500);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].loggerId).toBe('SMARTDOG_SENSOR_1612427023');
    });

    it('sets activePowerWatts and energyDailyKwh to null', async () => {
      const lines = smartdogCsv.sensorSimple(500);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBeNull();
    });

    it('handles 3-column format (ignores trailing -1 status)', async () => {
      // The mock data already includes the -1 status column
      const lines = smartdogCsv.sensorFile([
        { ts: SMARTDOG_TIMESTAMP, value: 1000.5 },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].irradiance).toBe(1000.5);
    });
  });

  describe('parse - OneWire Sensor', () => {
    beforeEach(() => {
      parser.canHandle(
        'onewire_1647527200_global_10_2_2025.txt',
        'timestamp;value\n',
      );
    });

    it('parses onewire file correctly', async () => {
      const lines = smartdogCsv.sensorSimple(25.5);
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(1);
      expect(results[0].loggerType).toBe('smartdog');
    });

    it('maps value to metadata.ambientTemperature', async () => {
      const lines = smartdogCsv.sensorFile([
        { ts: SMARTDOG_TIMESTAMP, value: 18.5 },
        { ts: SMARTDOG_TIMESTAMP + 300, value: 22.3 },
      ]);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].metadata).toMatchObject({ ambientTemperature: 18.5 });
      expect(results[1].metadata).toMatchObject({ ambientTemperature: 22.3 });
    });

    it('constructs loggerId as SMARTDOG_TEMP_{id}', async () => {
      const lines = smartdogCsv.sensorSimple(20);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].loggerId).toBe('SMARTDOG_TEMP_1647527200');
    });

    it('sets irradiance to null', async () => {
      const lines = smartdogCsv.sensorSimple(20);
      const results = await parseAndCollect(parser, lines);

      expect(results[0].irradiance).toBeNull();
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      parser.canHandle(
        'B1_A1_S1_global_11_1_2025.txt',
        'timestamp;address;bus;strings;stringid;pac;pdc;udc;temp\n',
      );
    });

    it('skips rows with invalid timestamps', async () => {
      const lines = [
        smartdogCsv.inverterHeader,
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP, 500),
        'invalid_ts;1;1;4;3;600;620;550;30', // Invalid timestamp
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP + 300, 700),
      ];
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(2);
      expect(results[0].activePowerWatts).toBe(500);
      expect(results[1].activePowerWatts).toBe(700);
    });

    it('skips rows with timestamps before year 2000', async () => {
      const lines = [
        smartdogCsv.inverterHeader,
        smartdogCsv.inverterRow(946684799, 500), // Dec 31, 1999 - too old
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP, 600),
      ];
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(600);
    });

    it('handles missing columns gracefully', async () => {
      const lines = [
        smartdogCsv.inverterHeader,
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP, 500),
        `${SMARTDOG_TIMESTAMP};1;1;4`, // Missing columns
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP + 300, 700),
      ];
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(2);
    });

    it('handles empty lines gracefully', async () => {
      const lines = [
        smartdogCsv.inverterHeader,
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP, 500),
        '',
        '   ',
        smartdogCsv.inverterRow(SMARTDOG_TIMESTAMP + 300, 700),
      ];
      const results = await parseAndCollect(parser, lines);

      expect(results).toHaveLength(2);
    });

    it('throws error for empty file', async () => {
      const lines = [''];
      await expect(parseAndCollect(parser, lines)).rejects.toThrow(
        'File is empty or has insufficient data',
      );
    });

    it('throws error for header-only file', async () => {
      const lines = smartdogCsv.inverterHeaderOnly();
      await expect(parseAndCollect(parser, lines)).rejects.toThrow(
        'File is empty or has insufficient data',
      );
    });
  });

  describe('parseUnixTimestamp (private method)', () => {
    interface SmartdogParserPrivate {
      parseUnixTimestamp(value: string): Date | null;
    }

    const parseTimestamp = (value: string): Date | null => {
      return (parser as unknown as SmartdogParserPrivate).parseUnixTimestamp(
        value,
      );
    };

    it('parses valid unix timestamp', () => {
      const result = parseTimestamp('1762152300');
      expect(result).toEqual(new Date(1762152300 * 1000));
    });

    it('returns null for empty string', () => {
      expect(parseTimestamp('')).toBeNull();
      expect(parseTimestamp('   ')).toBeNull();
    });

    it('returns null for non-numeric value', () => {
      expect(parseTimestamp('abc')).toBeNull();
      expect(parseTimestamp('2025-01-01')).toBeNull();
    });

    it('returns null for timestamps before year 2000', () => {
      expect(parseTimestamp('946684799')).toBeNull(); // Dec 31, 1999
    });

    it('returns null for timestamps after year 2100', () => {
      expect(parseTimestamp('4102444801')).toBeNull(); // After 2100
    });

    it('accepts timestamps at boundary values', () => {
      // Year 2000 boundary
      expect(parseTimestamp('946684800')).toEqual(new Date(946684800 * 1000));
      // Year 2100 boundary
      expect(parseTimestamp('4102444800')).toEqual(new Date(4102444800 * 1000));
    });
  });
});
