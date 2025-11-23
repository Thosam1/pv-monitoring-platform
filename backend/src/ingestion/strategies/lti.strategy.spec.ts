import { LtiParser } from './lti.strategy';
import { UnifiedMeasurementDTO } from '../dto/unified-measurement.dto';

describe('LtiParser', () => {
  let parser: LtiParser;

  beforeEach(() => {
    parser = new LtiParser();
  });

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
      const csvContent = [
        '[header]',
        'serial=090250014',
        'model=LTi5000',
        'firmware=1.2.3',
        '',
        '[data]',
        'timestamp;P_AC;E_DAY',
        '2025-10-01 10:00:00;1500;5.5',
        '2025-10-01 11:00:00;1800;6.2',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(2);
      expect(results[0].loggerId).toBe('090250014');
      expect(results[0].activePowerWatts).toBe(1500);
      expect(results[0].energyDailyKwh).toBe(5.5);
    });

    it('should extract serial from header metadata', async () => {
      const csvContent = [
        'serial=TEST_SERIAL_123',
        '[data]',
        'timestamp;P_AC',
        '2025-10-01 10:00:00;1000',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('TEST_SERIAL_123');
    });

    it('should prefer serial column over header serial', async () => {
      const csvContent = [
        'serial=HEADER_SERIAL',
        '[data]',
        'timestamp;serial;P_AC',
        '2025-10-01 10:00:00;COLUMN_SERIAL;1000',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('COLUMN_SERIAL');
    });

    it('should use "address" column as loggerId if no serial', async () => {
      const csvContent = [
        '[data]',
        'timestamp;address;P_AC',
        '2025-10-01 10:00:00;ADDRESS_123;1000',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('ADDRESS_123');
    });

    it('should parse semicolon-delimited CSV correctly', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC;E_DAY;voltage;current',
        '2025-10-01 12:00:00;2500;8.3;380;6.5',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(2500);
      expect(results[0].energyDailyKwh).toBe(8.3);
      expect(results[0].metadata).toHaveProperty('voltage', 380);
      expect(results[0].metadata).toHaveProperty('current', 6.5);
    });

    it('should handle empty values gracefully', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC;E_DAY',
        '2025-10-01 10:00:00;;5.5',
        '2025-10-01 11:00:00;1500;',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(2);
      expect(results[0].activePowerWatts).toBeNull();
      expect(results[0].energyDailyKwh).toBe(5.5);
      expect(results[1].activePowerWatts).toBe(1500);
      expect(results[1].energyDailyKwh).toBeNull();
    });

    it('should skip rows with invalid timestamps', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC',
        'invalid_timestamp;1000',
        '2025-10-01 10:00:00;1500',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1500);
    });

    it('should store unmapped fields in metadata', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC;grid_frequency;temperature',
        '2025-10-01 10:00:00;1000;50.02;45.5',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBe(1000);
      expect(results[0].metadata).toHaveProperty('gridFrequency', 50.02);
      expect(results[0].metadata).toHaveProperty('temperature', 45.5);
    });
  });

  describe('Timestamp Parsing', () => {
    it('should parse "YYYY-MM-DD HH:mm:ss" format', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC',
        '2025-10-01 14:30:45;1000',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T14:30:45.000Z',
      );
    });

    it('should parse ISO format as fallback', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC',
        '2025-10-01T10:00:00.000Z;1000',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-10-01T10:00:00.000Z',
      );
    });
  });

  describe('Field Mapping', () => {
    it('should map P_AC to activePowerWatts', async () => {
      const csvContent = [
        '[data]',
        'timestamp;P_AC',
        '2025-10-01 10:00:00;1234',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].activePowerWatts).toBe(1234);
    });

    it('should map E_DAY to energyDailyKwh', async () => {
      const csvContent = [
        '[data]',
        'timestamp;E_DAY',
        '2025-10-01 10:00:00;12.5',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

      expect(results[0].energyDailyKwh).toBe(12.5);
    });

    it('should map irradiance field', async () => {
      const csvContent = [
        '[data]',
        'timestamp;irradiance',
        '2025-10-01 10:00:00;850',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');
      const results = await collectDTOs(parser.parse(buffer));

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
      const csvContent = [
        '[header]',
        'serial=123',
        '[data]',
        'timestamp;P_AC',
      ].join('\n');

      const buffer = Buffer.from(csvContent, 'utf-8');

      await expect(collectDTOs(parser.parse(buffer))).rejects.toThrow(
        'No valid data rows found',
      );
    });
  });
});
