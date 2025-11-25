import { MeteoControlParser } from './meteocontrol.strategy';
import { collectDTOs, parseAndCollect } from '../../../test/utils/test-helpers';
import { meteocontrolCsv } from '../../../test/utils/mock-data';

describe('MeteoControlParser', () => {
  let parser: MeteoControlParser;

  beforeEach(() => {
    parser = new MeteoControlParser();
  });

  describe('canHandle', () => {
    it('should return true for filename containing "delta_analog"', () => {
      expect(
        parser.canHandle('delta_analog_Thu Nov 06 2025 11:52:00.txt', ''),
      ).toBe(true);
    });

    it('should return true for filename with delta_analog (case insensitive)', () => {
      expect(parser.canHandle('DELTA_ANALOG_test.txt', '')).toBe(true);
    });

    it('should return true for content with [info], Datum=, and G_M columns', () => {
      const snippet = `[info]
Anlage=Test
Datum=251106
[messung]
Uhrzeit;G_M6;G_M10`;
      expect(parser.canHandle('unknown.txt', snippet)).toBe(true);
    });

    it('should return true for delta_inverter files', () => {
      expect(parser.canHandle('delta_inverter_test.txt', '')).toBe(true);
    });

    it('should return false for unrelated file', () => {
      expect(parser.canHandle('goodwe_export.csv', 'Pac,E_Day')).toBe(false);
    });
  });

  describe('Timestamp Construction', () => {
    it('should correctly parse Datum=251106 as November 6, 2025', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withDatum('251106', '12:45:00', 657),
      );

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-11-06T12:45:00.000Z',
      );
    });

    it('should correctly parse Y2K year (25 -> 2025)', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withDatum('251001', '10:00:00', 500),
      );

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.getUTCFullYear()).toBe(2025);
      expect(results[0].timestamp.getUTCMonth()).toBe(9); // October (0-indexed)
      expect(results[0].timestamp.getUTCDate()).toBe(1);
    });

    it('should handle 24:00:00 as 00:00:00 next day', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.with24Timestamp('251106', 100),
      );

      expect(results).toHaveLength(1);
      // 24:00:00 on Nov 6 -> 00:00:00 on Nov 7
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-11-07T00:00:00.000Z',
      );
    });

    it('should combine date and time correctly', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withDatum('250315', '14:30:45', 800),
      );

      expect(results).toHaveLength(1);
      expect(results[0].timestamp.toISOString()).toBe(
        '2025-03-15T14:30:45.000Z',
      );
    });
  });

  describe('Field Mapping', () => {
    it('should map G_M6 to irradiance golden metric', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      expect(results).toHaveLength(1);
      expect(results[0].irradiance).toBe(657);
    });

    it('should map G_M10 and other G_* columns to metadata with semantic names', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      expect(results).toHaveLength(1);
      // G_M10 -> irradiancePoa10 (Plane of Array sensor)
      expect(results[0].metadata).toHaveProperty('irradiancePoa10', 637); // 657 - 20
      // G_M18 -> irradiancePoa18 (Plane of Array sensor)
      expect(results[0].metadata).toHaveProperty('irradiancePoa18', 647); // 657 - 10
    });

    it('should set activePowerWatts to null for analog files', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      expect(results).toHaveLength(1);
      expect(results[0].activePowerWatts).toBeNull();
    });

    it('should set energyDailyKwh to null for analog files', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      expect(results).toHaveLength(1);
      expect(results[0].energyDailyKwh).toBeNull();
    });

    it('should store interval in metadata as intervalSeconds', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      expect(results).toHaveLength(1);
      expect(results[0].metadata).toHaveProperty('intervalSeconds', 900);
    });
  });

  describe('LoggerId Extraction and Sanitization', () => {
    it('should sanitize Anlage value for loggerId', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withAnlage('Turnow-P. 1 FF - Strang N2', 500),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('Turnow_P_1_FF_Strang_N2');
    });

    it('should replace spaces with underscores', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withAnlage('Test Installation', 500),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('Test_Installation');
    });

    it('should replace dots with underscores', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withAnlage('Test.Station.1', 500),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('Test_Station_1');
    });

    it('should replace dashes with underscores', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withAnlage('Test-Station-1', 500),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('Test_Station_1');
    });

    it('should collapse multiple underscores', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withAnlage('Test..Station  1', 500),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('Test_Station_1');
    });
  });

  describe('Edge Cases', () => {
    it('should skip Info;Time marker lines', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withMarkerLines(650),
      );

      // Should have 2 data rows (marker line skipped)
      expect(results).toHaveLength(2);
      expect(results[0].irradiance).toBe(650);
      expect(results[1].irradiance).toBe(660);
    });

    it('should parse -0 as 0', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withEdgeCases(),
      );

      expect(results).toHaveLength(2);
      expect(results[0].irradiance).toBe(0); // -0 normalized to 0
      expect(Object.is(results[0].irradiance, -0)).toBe(false);
    });

    it('should handle empty values as null', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.withEdgeCases(),
      );

      expect(results).toHaveLength(2);
      // First row: G_M18 is empty -> irradiancePoa18
      expect(results[0].metadata).toHaveProperty('irradiancePoa18', null);
      // Second row: G_M6 (irradiance) is empty
      expect(results[1].irradiance).toBeNull();
    });

    it('should skip units row (starts with ;)', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      // Units row should not create a data point
      expect(results).toHaveLength(1);
      expect(results[0].irradiance).toBe(657);
    });
  });

  describe('Multiple Data Rows', () => {
    it('should parse multiple data rows correctly', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.multipleRows([
          { time: '12:00:00', irradiance: 600 },
          { time: '12:15:00', irradiance: 650 },
          { time: '12:30:00', irradiance: 700 },
        ]),
      );

      expect(results).toHaveLength(3);
      expect(results[0].irradiance).toBe(600);
      expect(results[1].irradiance).toBe(650);
      expect(results[2].irradiance).toBe(700);
    });

    it('should maintain consistent loggerId across rows', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.multipleRows([
          { time: '12:00:00', irradiance: 600 },
          { time: '12:15:00', irradiance: 650 },
        ]),
      );

      expect(results[0].loggerId).toBe(results[1].loggerId);
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
        parseAndCollect(parser, meteocontrolCsv.headersOnly()),
      ).rejects.toThrow('No valid data rows found');
    });
  });

  describe('Parser Metadata', () => {
    it('should set loggerType to meteocontrol', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.simple(657),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerType).toBe('meteocontrol');
    });

    it('should have correct parser name', () => {
      expect(parser.name).toBe('meteocontrol');
    });

    it('should have correct description', () => {
      expect(parser.description).toContain('Meteo Control');
    });
  });

  // ===== delta_inverter Tests (Phase 2) =====

  describe('delta_inverter: File Type Detection', () => {
    it('should detect inverter file type from headers', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      // Inverter files have activePowerWatts and energyDailyKwh, not irradiance
      expect(results[0].activePowerWatts).not.toBeNull();
      expect(results[0].irradiance).toBeNull();
    });

    it('should return true for content with Serien Nummer column', () => {
      const snippet = `[info]
Anlage=Test
Datum=251106
[messung]
Uhrzeit;Serien Nummer;Pac;E_Tag`;
      expect(parser.canHandle('unknown.txt', snippet)).toBe(true);
    });
  });

  describe('delta_inverter: Golden Metrics', () => {
    it('should convert Pac from kW to Watts (× 1000)', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      // 5.0 kW -> 5000 W
      expect(results[0].activePowerWatts).toBe(5000);
    });

    it('should map E_Tag directly to energyDailyKwh', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      expect(results[0].energyDailyKwh).toBe(10.5);
    });

    it('should set irradiance to null for inverter files', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      expect(results[0].irradiance).toBeNull();
    });
  });

  describe('delta_inverter: LoggerId from Serien Nummer', () => {
    it('should use Serien Nummer as loggerId', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      expect(results[0].loggerId).toBe('084A837B');
    });

    it('should create separate DTOs for each inverter', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterMultiple([
          { serial: 'INV001', pacKw: 5.0, eTagKwh: 10.0 },
          { serial: 'INV002', pacKw: 4.5, eTagKwh: 9.0 },
          { serial: 'INV003', pacKw: 5.2, eTagKwh: 11.0 },
        ]),
      );

      expect(results).toHaveLength(3);
      expect(results[0].loggerId).toBe('INV001');
      expect(results[1].loggerId).toBe('INV002');
      expect(results[2].loggerId).toBe('INV003');
    });

    it('should have same timestamp for all inverters in same row', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterMultiple([
          { serial: 'INV001', pacKw: 5.0, eTagKwh: 10.0 },
          { serial: 'INV002', pacKw: 4.5, eTagKwh: 9.0 },
        ]),
      );

      expect(results).toHaveLength(2);
      expect(results[0].timestamp.toISOString()).toBe(
        results[1].timestamp.toISOString(),
      );
    });
  });

  describe('delta_inverter: Semantic Field Names', () => {
    it('should map Uac_L1 to voltageAcPhaseA in metadata', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      expect(results[0].metadata).toHaveProperty('voltageAcPhaseA', 318.16);
    });

    it('should map Fac to gridFrequencyHz in metadata', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterSimple('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      expect(results[0].metadata).toHaveProperty('gridFrequencyHz', 50.0);
    });

    it('should map full inverter columns with semantic names', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterFull('084A837B', 5.0, 10.5),
      );

      expect(results).toHaveLength(1);
      const meta = results[0].metadata;

      // Check various semantic field mappings
      expect(meta).toHaveProperty('voltageDcActual', 10);
      expect(meta).toHaveProperty('currentDcAmps', 5.1);
      expect(meta).toHaveProperty('powerDcKw', 0.5);
      expect(meta).toHaveProperty('energyLifetimeKwh', 12072483.3);
      expect(meta).toHaveProperty('temperatureStringC', 17.0);
      expect(meta).toHaveProperty('temperatureInverterC', 7.24);
      expect(meta).toHaveProperty('insulationResistanceKohm', 0);
      expect(meta).toHaveProperty('operatingHoursTotal', 49376.13);
    });
  });

  describe('delta_inverter: Multiple Inverters Power Values', () => {
    it('should correctly convert Pac for each inverter', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterMultiple([
          { serial: 'INV001', pacKw: 5.0, eTagKwh: 10.0 },
          { serial: 'INV002', pacKw: 4.5, eTagKwh: 9.0 },
        ]),
      );

      expect(results).toHaveLength(2);
      expect(results[0].activePowerWatts).toBe(5000); // 5.0 kW -> 5000 W
      expect(results[1].activePowerWatts).toBe(4500); // 4.5 kW -> 4500 W
    });

    it('should correctly map E_Tag for each inverter', async () => {
      const results = await parseAndCollect(
        parser,
        meteocontrolCsv.inverterMultiple([
          { serial: 'INV001', pacKw: 5.0, eTagKwh: 10.0 },
          { serial: 'INV002', pacKw: 4.5, eTagKwh: 9.0 },
        ]),
      );

      expect(results).toHaveLength(2);
      expect(results[0].energyDailyKwh).toBe(10.0);
      expect(results[1].energyDailyKwh).toBe(9.0);
    });
  });
});
