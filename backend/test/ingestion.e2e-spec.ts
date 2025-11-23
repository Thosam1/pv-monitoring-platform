import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as path from 'path';
import * as fs from 'fs';
import { IngestionModule } from '../src/ingestion/ingestion.module';
import { Measurement } from '../src/database/entities/measurement.entity';
import { BulkIngestionResponse } from '../src/ingestion/ingestion.controller';

/**
 * E2E Tests for IngestionController (Bulk Upload API)
 *
 * Uses the real IngestionModule (Controller + Service + Parser) but overrides
 * the TypeORM Repository to prevent actual database writes.
 * This allows testing the full HTTP layer including Multer file upload handling.
 */
describe('IngestionController (e2e)', () => {
  let app: INestApplication<App>;
  let mockRepository: {
    createQueryBuilder: jest.Mock;
  };

  // Path to test fixture
  const fixturesPath = path.join(__dirname, 'fixtures');
  const sampleCsvPath = path.join(fixturesPath, 'sample-goodwe.csv');

  beforeAll(() => {
    // Verify fixture file exists
    if (!fs.existsSync(sampleCsvPath)) {
      throw new Error(`Test fixture not found: ${sampleCsvPath}`);
    }
  });

  beforeEach(async () => {
    // Mock repository that simulates successful upsert operations
    mockRepository = {
      createQueryBuilder: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({
          identifiers: Array(3).fill({
            loggerId: 'TEST',
            timestamp: new Date(),
          }),
        }),
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IngestionModule],
    })
      .overrideProvider(getRepositoryToken(Measurement))
      .useValue(mockRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /ingest/:loggerType', () => {
    describe('successful uploads', () => {
      it('should accept multipart file upload and return 201', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/goodwe')
          .attach('files', sampleCsvPath)
          .expect(201);

        expect(response.body).toHaveProperty('successCount');
        expect(response.body).toHaveProperty('errorCount');
        expect(response.body).toHaveProperty('totalRecordsInserted');
        expect(response.body).toHaveProperty('results');
      });

      it('should return successCount >= 1 for valid CSV', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/goodwe')
          .attach('files', sampleCsvPath)
          .expect(201);

        const body = response.body as BulkIngestionResponse;
        expect(body.successCount).toBeGreaterThanOrEqual(1);
        expect(body.totalRecordsInserted).toBeGreaterThanOrEqual(0);
      });

      it('should return correct response structure with BulkIngestionResponse', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/goodwe')
          .attach('files', sampleCsvPath)
          .expect(201);

        const body = response.body as BulkIngestionResponse;

        // Verify response structure
        expect(body).toMatchObject({
          successCount: expect.any(Number) as number,
          errorCount: expect.any(Number) as number,
          totalRecordsInserted: expect.any(Number) as number,
          results: expect.any(Array) as unknown[],
        });

        // Verify results array structure
        expect(body.results.length).toBeGreaterThan(0);
        expect(body.results[0]).toMatchObject({
          filename: expect.any(String) as string,
          success: expect.any(Boolean) as boolean,
        });
      });

      it('should include recordsProcessed in file results', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/goodwe')
          .attach('files', sampleCsvPath)
          .expect(201);

        const body = response.body as BulkIngestionResponse;
        const fileResult = body.results[0];
        expect(fileResult.success).toBe(true);
        expect(fileResult.recordsProcessed).toBeGreaterThanOrEqual(0);
        expect(fileResult.recordsInserted).toBeGreaterThanOrEqual(0);
      });

      it('should handle bulk upload with multiple files', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/goodwe')
          .attach('files', sampleCsvPath)
          .attach('files', sampleCsvPath) // Same file twice for testing
          .expect(201);

        const body = response.body as BulkIngestionResponse;
        expect(body.results).toHaveLength(2);
        expect(body.successCount).toBe(2);
      });
    });

    describe('error handling', () => {
      it('should return 400 when no files uploaded', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/goodwe')
          .expect(400);

        const body = response.body as { message: string };
        expect(body.message).toContain('No files uploaded');
      });
    });

    describe('different logger types', () => {
      it('should accept different loggerType parameter', async () => {
        const response = await request(app.getHttpServer())
          .post('/ingest/sma')
          .attach('files', sampleCsvPath)
          .expect(201);

        const body = response.body as BulkIngestionResponse;
        expect(body).toHaveProperty('results');
      });
    });
  });

  describe('POST /ingest/goodwe with inline buffer', () => {
    it('should accept CSV content as buffer', async () => {
      const csvContent = [
        '20251001T120000,INLINE_TEST,pac,2000',
        '20251001T120000,INLINE_TEST,e_day,8.5',
      ].join('\n');

      const response = await request(app.getHttpServer())
        .post('/ingest/goodwe')
        .attach('files', Buffer.from(csvContent), 'inline-test.csv')
        .expect(201);

      const body = response.body as BulkIngestionResponse;
      expect(body.successCount).toBeGreaterThanOrEqual(1);
      expect(body.results[0].filename).toBe('inline-test.csv');
    });
  });
});

describe('IngestionController (e2e) - Repository Failure', () => {
  let app: INestApplication<App>;
  const fixturesPath = path.join(__dirname, 'fixtures');
  const sampleCsvPath = path.join(fixturesPath, 'sample-goodwe.csv');

  beforeEach(async () => {
    // Mock repository that simulates database failure
    const failingMockRepository = {
      createQueryBuilder: jest.fn(() => ({
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orUpdate: jest.fn().mockReturnThis(),
        execute: jest
          .fn()
          .mockRejectedValue(new Error('Database connection failed')),
      })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [IngestionModule],
    })
      .overrideProvider(getRepositoryToken(Measurement))
      .useValue(failingMockRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should handle database errors gracefully', async () => {
    const response = await request(app.getHttpServer())
      .post('/ingest/goodwe')
      .attach('files', sampleCsvPath)
      .expect(201); // Service catches error, returns success response with failure report

    const body = response.body as BulkIngestionResponse;
    expect(body.successCount).toBe(0);
    expect(body.errorCount).toBe(1);
    expect(body.results[0].success).toBe(false);
    expect(body.results[0].error).toContain('Database connection failed');
  });
});
