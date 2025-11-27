import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IngestionService } from './ingestion.service';
import { Measurement } from '../database/entities/measurement.entity';
import { GoodWeParser } from './strategies/goodwe.strategy';
import { LtiParser } from './strategies/lti.strategy';
import { IntegraParser } from './strategies/integra.strategy';
import { MbmetParser } from './strategies/mbmet.strategy';
import { MeierParser } from './strategies/meier.strategy';
import { MeteoControlParser } from './strategies/meteocontrol.strategy';
import { PlexlogParser } from './strategies/plexlog.strategy';
import { SmartdogParser } from './strategies/smartdog.strategy';
import { UnifiedMeasurementDTO } from './dto/unified-measurement.dto';

describe('IngestionService', () => {
  let service: IngestionService;
  let goodWeParser: jest.Mocked<GoodWeParser>;
  let ltiParser: jest.Mocked<LtiParser>;
  let integraParser: jest.Mocked<IntegraParser>;
  let mbmetParser: jest.Mocked<MbmetParser>;
  let meierParser: jest.Mocked<MeierParser>;
  let meteoControlParser: jest.Mocked<MeteoControlParser>;
  let plexlogParser: jest.Mocked<PlexlogParser>;
  let smartdogParser: jest.Mocked<SmartdogParser>;

  const mockRepository = {
    createQueryBuilder: jest.fn(),
  };

  const mockQueryBuilder = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orUpdate: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  };

  const mockGoodWeParser = {
    name: 'goodwe',
    description: 'GoodWe Parser',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockLtiParser = {
    name: 'lti',
    description: 'LTI Parser',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockIntegraParser = {
    name: 'integra',
    description: 'Integra Sun XML Export (Meteocontrol format)',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockMbmetParser = {
    name: 'mbmet',
    description: 'MBMET 501FB Meteo Station CSV Export',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockMeierParser = {
    name: 'meier',
    description: 'Meier-NT Logger CSV Export',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockMeteoControlParser = {
    name: 'meteocontrol',
    description: 'Meteo Control Web Platform INI Export (delta_analog)',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockPlexlogParser = {
    name: 'plexlog',
    description: 'Plexlog SQLite Database Export (.s3db)',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  const mockSmartdogParser = {
    name: 'smartdog',
    description: 'SmartDog Logger CSV Export',
    canHandle: jest.fn(),
    parse: jest.fn(),
  };

  beforeEach(async () => {
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.execute.mockResolvedValue({ identifiers: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: getRepositoryToken(Measurement),
          useValue: mockRepository,
        },
        {
          provide: GoodWeParser,
          useValue: mockGoodWeParser,
        },
        {
          provide: LtiParser,
          useValue: mockLtiParser,
        },
        {
          provide: IntegraParser,
          useValue: mockIntegraParser,
        },
        {
          provide: MbmetParser,
          useValue: mockMbmetParser,
        },
        {
          provide: MeierParser,
          useValue: mockMeierParser,
        },
        {
          provide: MeteoControlParser,
          useValue: mockMeteoControlParser,
        },
        {
          provide: PlexlogParser,
          useValue: mockPlexlogParser,
        },
        {
          provide: SmartdogParser,
          useValue: mockSmartdogParser,
        },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
    goodWeParser = module.get(GoodWeParser);
    ltiParser = module.get(LtiParser);
    integraParser = module.get(IntegraParser);
    mbmetParser = module.get(MbmetParser);
    meierParser = module.get(MeierParser);
    meteoControlParser = module.get(MeteoControlParser);
    plexlogParser = module.get(PlexlogParser);
    smartdogParser = module.get(SmartdogParser);

    jest.clearAllMocks();
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
  });

  describe('ingestFile', () => {
    const createMockDTO = (overrides = {}): UnifiedMeasurementDTO => ({
      timestamp: new Date('2024-06-15T12:00:00Z'),
      loggerId: 'TEST-001',
      loggerType: 'goodwe',
      activePowerWatts: 5000,
      energyDailyKwh: 25,
      irradiance: 800,
      metadata: { temperature: 35 },
      ...overrides,
    });

    function* mockParseGenerator(
      dtos: UnifiedMeasurementDTO[],
    ): Generator<UnifiedMeasurementDTO> {
      for (const dto of dtos) {
        yield dto;
      }
    }

    it('should successfully ingest a file with GoodWe parser', async () => {
      const fileBuffer = Buffer.from('test,csv,content');
      const mockDTO = createMockDTO();

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(true);
      goodWeParser.parse.mockReturnValue(mockParseGenerator([mockDTO]));
      mockQueryBuilder.execute.mockResolvedValue({
        identifiers: [{ id: 1 }],
      });

      const result = await service.ingestFile('goodwe_test.csv', fileBuffer);

      expect(result.success).toBe(true);
      expect(result.parserUsed).toBe('goodwe');
      expect(result.recordsProcessed).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should successfully ingest a file with LTI parser', async () => {
      const fileBuffer = Buffer.from('[header]\n[data]\ntest');
      const mockDTO = createMockDTO({ loggerType: 'lti' });

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(true);
      ltiParser.parse.mockReturnValue(mockParseGenerator([mockDTO]));
      mockQueryBuilder.execute.mockResolvedValue({
        identifiers: [{ id: 1 }],
      });

      const result = await service.ingestFile('lti_export.csv', fileBuffer);

      expect(result.success).toBe(true);
      expect(result.parserUsed).toBe('lti');
      expect(result.recordsInserted).toBe(1);
    });

    it('should return error when no parser can handle file', async () => {
      const fileBuffer = Buffer.from('unknown format');

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(false);

      const result = await service.ingestFile('unknown.csv', fileBuffer);

      expect(result.success).toBe(false);
      expect(result.parserUsed).toBe('none');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('No parser found');
    });

    it('should process multiple records in batches', async () => {
      const fileBuffer = Buffer.from('multi record file');
      const dtos = Array.from({ length: 5 }, (_, i) =>
        createMockDTO({
          timestamp: new Date(`2024-06-15T${10 + i}:00:00Z`),
        }),
      );

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(true);
      goodWeParser.parse.mockReturnValue(mockParseGenerator(dtos));
      mockQueryBuilder.execute.mockResolvedValue({
        identifiers: dtos.map((_, i) => ({ id: i + 1 })),
      });

      const result = await service.ingestFile('goodwe_multi.csv', fileBuffer);

      expect(result.success).toBe(true);
      expect(result.recordsProcessed).toBe(5);
      expect(result.recordsInserted).toBe(5);
    });

    it('should handle empty file (no records)', async () => {
      const fileBuffer = Buffer.from('headers only');

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(true);
      goodWeParser.parse.mockReturnValue(mockParseGenerator([]));

      const result = await service.ingestFile('goodwe_empty.csv', fileBuffer);

      expect(result.success).toBe(false);
      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsInserted).toBe(0);
    });

    it('should track duration in milliseconds', async () => {
      const fileBuffer = Buffer.from('test');
      const mockDTO = createMockDTO();

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(true);
      goodWeParser.parse.mockReturnValue(mockParseGenerator([mockDTO]));
      mockQueryBuilder.execute.mockResolvedValue({
        identifiers: [{ id: 1 }],
      });

      const result = await service.ingestFile('test.csv', fileBuffer);

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe('number');
    });

    it('should handle database errors gracefully', async () => {
      const fileBuffer = Buffer.from('test');
      const mockDTO = createMockDTO();

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(true);
      goodWeParser.parse.mockReturnValue(mockParseGenerator([mockDTO]));
      mockQueryBuilder.execute.mockRejectedValue(
        new Error('DB connection lost'),
      );

      const result = await service.ingestFile('test.csv', fileBuffer);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should use default loggerType from parser if not in DTO', async () => {
      const fileBuffer = Buffer.from('test');
      const mockDTO = createMockDTO({ loggerType: undefined });

      plexlogParser.canHandle.mockReturnValue(false);
      ltiParser.canHandle.mockReturnValue(false);
      integraParser.canHandle.mockReturnValue(false);
      meteoControlParser.canHandle.mockReturnValue(false);
      mbmetParser.canHandle.mockReturnValue(false);
      meierParser.canHandle.mockReturnValue(false);
      smartdogParser.canHandle.mockReturnValue(false);
      goodWeParser.canHandle.mockReturnValue(true);
      goodWeParser.parse.mockReturnValue(mockParseGenerator([mockDTO]));
      mockQueryBuilder.execute.mockResolvedValue({
        identifiers: [{ id: 1 }],
      });

      await service.ingestFile('test.csv', fileBuffer);

      expect(mockQueryBuilder.values).toHaveBeenCalled();
    });

    it('should skip .DS_Store system files', async () => {
      const fileBuffer = Buffer.from('binary content');

      const result = await service.ingestFile('.DS_Store', fileBuffer);

      expect(result.success).toBe(false);
      expect(result.parserUsed).toBe('none');
      expect(result.errors).toContain('System file skipped');
    });

    it('should skip hidden files starting with dot', async () => {
      const fileBuffer = Buffer.from('hidden content');

      const result = await service.ingestFile('.hidden_config', fileBuffer);

      expect(result.success).toBe(false);
      expect(result.parserUsed).toBe('none');
      expect(result.errors).toContain('System file skipped');
    });

    it('should skip Thumbs.db system files', async () => {
      const fileBuffer = Buffer.from('thumbnail data');

      const result = await service.ingestFile('Thumbs.db', fileBuffer);

      expect(result.success).toBe(false);
      expect(result.parserUsed).toBe('none');
      expect(result.errors).toContain('System file skipped');
    });

    it('should handle system files in folder paths', async () => {
      const fileBuffer = Buffer.from('content');

      const result = await service.ingestFile(
        'uploads/folder/.DS_Store',
        fileBuffer,
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain('System file skipped');
    });
  });

  describe('getSupportedParsers', () => {
    it('should return list of supported parsers', () => {
      const parsers = service.getSupportedParsers();

      expect(parsers).toEqual([
        {
          name: 'plexlog',
          description: 'Plexlog SQLite Database Export (.s3db)',
        },
        { name: 'lti', description: 'LTI Parser' },
        {
          name: 'integra',
          description: 'Integra Sun XML Export (Meteocontrol format)',
        },
        {
          name: 'meteocontrol',
          description: 'Meteo Control Web Platform INI Export (delta_analog)',
        },
        { name: 'mbmet', description: 'MBMET 501FB Meteo Station CSV Export' },
        { name: 'meier', description: 'Meier-NT Logger CSV Export' },
        { name: 'smartdog', description: 'SmartDog Logger CSV Export' },
        { name: 'goodwe', description: 'GoodWe Parser' },
      ]);
    });
  });
});
