import { LtiParser } from './lti.strategy';
import { collectDTOs, parseAndCollect } from '../../../test/utils/test-helpers';
import { ltiCsv, LTI_TIMESTAMP } from '../../../test/utils/mock-data';

describe('LtiParser', () => {
  let parser: LtiParser;

  beforeEach(() => {
    parser = new LtiParser();
  });

  describe('canHandle', () => {
    it('should return true for filename containing "LTi"', () => {
      expect(parser.canHandle('LTi090250014_inverter_20251001.csv', '')).toBe(
        true,
      );
    });

    it('should return true for filename containing "lti" (case insensitive)', () => {
      expect(parser.canHandle('lti_data.csv', '')).toBe(true);
    });

    it('should return true for content containing "[header]"', () => {
      expect(parser.canHandle('data.csv', '[header]\nserial=12345')).toBe(true);
    });

    it('should return true for content containing "[data]"', () => {
      expect(parser.canHandle('data.csv', 'some metadata\n[data]')).toBe(true);
    });

    it('should return false for unrelated file', () => {
      expect(parser.canHandle('goodwe_export.csv', 'Pac,E_Day')).toBe(false);
    });
  });

  describe('parse - Sectioned CSV Format', () => {
    it('should skip header section and parse data after [data] marker', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.fullHeader(
          '090250014',
          'timestamp;P_AC;E_DAY',
          `${LTI_TIMESTAMP};1500;5.5`,
          '2025-10-01 11:00:00;1800;6.2',
        ),
      );

      expect(results).toHaveLength(2);
      expect(results[0].loggerId).toBe('090250014');
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[0].energyDailyKwh).toBe(5.5);
    });

    it('should extract serial from header metadata', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withSerial(
          'TEST_SERIAL_123',
          'timestamp;P_AC',
          `${LTI_TIMESTAMP};1000`,
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('TEST_SERIAL_123');
    });

    it('should prefer serial column over header serial', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withSerial(
          'HEADER_SERIAL',
          'timestamp;serial;P_AC',
          `${LTI_TIMESTAMP};COLUMN_SERIAL;1000`,
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('COLUMN_SERIAL');
    });

    it('should use "address" column as loggerId if no serial', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader(
          'timestamp;address;P_AC',
          `${LTI_TIMESTAMP};ADDRESS_123;1000`,
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('ADDRESS_123');
    });

    it('should parse semicolon-delimited CSV correctly', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader(
          'timestamp;P_AC;E_DAY;voltage;current',
          '2025-10-01 12:00:00;2500;8.3;380;6.5',
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(2500);
      expect(results[0].energyDailyKwh).toBe(8.3);
      expect(results[0].metadata).toHaveProperty('voltage', 380);
      expect(results[0].metadata).toHaveProperty('current', 6.5);
    });

    it('should handle empty values gracefully', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader(
          'timestamp;P_AC;E_DAY',
          `${LTI_TIMESTAMP};;5.5`,
          '2025-10-01 11:00:00;1500;',
        ),
      );

      expect(results).toHaveLength(2);
      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBe(5.5);
      expect(results[1].activePowerWatts).toBe(1500);
      expect(results[1].energyDailyKwh).toBeNull();
    });

    it('should skip rows with invalid timestamps', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader(
          'timestamp;P_AC',
          'invalid_timestamp;1000',
          `${LTI_TIMESTAMP};1500`,
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should store unmapped fields in metadata', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader(
          'timestamp;P_AC;grid_frequency;temperature',
          `${LTI_TIMESTAMP};1000;50.02;45.5`,
        ),
      );

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1000);
      expect(results[0].metadata).toHaveProperty('gridFrequency', 50.02);
      expect(results[0].metadata).toHaveProperty('temperature', 45.5);
    });
  });

  describe('Timestamp Parsing', () => {
    it('should parse "YYYY-MM-DD HH:mm:ss" format', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;P_AC', '2025-10-01 14:30:45;1000'),
      );

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T14:30:45.000Z',
      );
    });

    it('should parse ISO format as fallback', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;P_AC', '2025-10-01T10:00:00.000Z;1000'),
      );

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
    });
  });

  describe('Field Mapping', () => {
    it('should map P_AC to activePowerWatts', async () => {
      const results = await parseAndCollect(parser, ltiCsv.simple(1234));
      expect(results[0].activePowerWatts).toBe(1234);
    });

    it('should map E_DAY to energyDailyKwh', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;E_DAY', `${LTI_TIMESTAMP};12.5`),
      );
      expect(results[0].energyDailyKwh).toBe(12.5);
    });

    it('should map irradiance field', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;irradiance', `${LTI_TIMESTAMP};850`),
      );
      expect(results[0].irradiance).toBe(850);
    });
  });

  describe('Error Handling', () => {
    it('should throw ParserError for empty file', async () => {
      const buffer = Buffer.from('', 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'File is empty',
      );
    });

    it('should throw ParserError when no data rows found', async () => {
      await expect(
        parseAndCollect(parser, ltiCsv.headerOnly('123', 'timestamp;P_AC')),
      ).rejects.toThrow('No valid data rows found');
    });
  });

  describe('Semantic Normalization', () => {
    it('should translate U_AC to voltageAC', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;U_AC', `${LTI_TIMESTAMP};230`),
      );
      expect(results[0].metadata).toHaveProperty('voltageAC', 230);
    });

    it('should translate I_AC to currentAC', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;I_AC', `${LTI_TIMESTAMP};10.5`),
      );
      expect(results[0].metadata).toHaveProperty('currentAC', 10.5);
    });

    it('should translate U_DC to voltageDC', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;U_DC', `${LTI_TIMESTAMP};400`),
      );
      expect(results[0].metadata).toHaveProperty('voltageDC', 400);
    });

    it('should translate I_DC to currentDC', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;I_DC', `${LTI_TIMESTAMP};8.2`),
      );
      expect(results[0].metadata).toHaveProperty('currentDC', 8.2);
    });

    it('should translate E_INT to energyInterval', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;E_INT', `${LTI_TIMESTAMP};1.5`),
      );
      expect(results[0].metadata).toHaveProperty('energyInterval', 1.5);
    });

    it('should translate E_TOTAL to energyTotal', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;E_TOTAL', `${LTI_TIMESTAMP};12345`),
      );
      expect(results[0].metadata).toHaveProperty('energyTotal', 12345);
    });

    it('should translate T_CH to temperatureChannel', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;T_CH', `${LTI_TIMESTAMP};45`),
      );
      expect(results[0].metadata).toHaveProperty('temperatureChannel', 45);
    });

    it('should translate T_TR to temperatureTransformer', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;T_TR', `${LTI_TIMESTAMP};55`),
      );
      expect(results[0].metadata).toHaveProperty('temperatureTransformer', 55);
    });

    it('should translate T_HS to temperatureHeatsink', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;T_HS', `${LTI_TIMESTAMP};60`),
      );
      expect(results[0].metadata).toHaveProperty('temperatureHeatsink', 60);
    });

    it('should translate COS_PHI to powerFactor', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;COS_PHI', `${LTI_TIMESTAMP};0.95`),
      );
      expect(results[0].metadata).toHaveProperty('powerFactor', 0.95);
    });

    it('should translate PC to powerCurtailment', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;PC', `${LTI_TIMESTAMP};100`),
      );
      expect(results[0].metadata).toHaveProperty('powerCurtailment', 100);
    });

    it('should fallback to camelCase for unknown fields', async () => {
      const results = await parseAndCollect(
        parser,
        ltiCsv.withHeader('timestamp;unknown_field', `${LTI_TIMESTAMP};123`),
      );
      expect(results[0].metadata).toHaveProperty('unknownField', 123);
    });
  });
});
