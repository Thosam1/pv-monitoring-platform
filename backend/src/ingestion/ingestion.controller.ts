import {
  Controller,
  Post,
  Param,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { IngestionService, IngestionResult } from './ingestion.service';

/**
 * Result for a single file in bulk upload
 */
export interface FileIngestionResult {
  filename: string;
  success: boolean;
  parserUsed?: string;
  recordsInserted?: number;
  recordsProcessed?: number;
  error?: string;
}

/**
 * Response DTO for bulk ingestion endpoint
 */
export interface BulkIngestionResponse {
  successCount: number;
  errorCount: number;
  totalRecordsInserted: number;
  results: FileIngestionResult[];
}

/**
 * IngestionController
 *
 * Exposes file upload endpoints for data ingestion.
 * Supports bulk uploads (up to 10 files per request).
 *
 * Usage:
 *   POST /ingest/goodwe
 *   Content-Type: multipart/form-data
 *   Body: files=<csv_file1>&files=<csv_file2>...
 *
 * Future endpoints:
 *   POST /ingest/sma
 *   POST /ingest/fronius
 *   POST /ingest/auto  (auto-detect parser)
 */
@Controller('ingest')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Ingest multiple files for a specific logger type (bulk upload)
   *
   * @param loggerType - Parser identifier (e.g., 'goodwe', 'sma')
   * @param files - Array of uploaded CSV files (max 10)
   * @returns Aggregate result with success/error counts
   *
   * @example
   * curl -X POST http://localhost:3000/ingest/goodwe \
   *   -F "files=@/path/to/file1.csv" \
   *   -F "files=@/path/to/file2.csv"
   */
  @Post(':loggerType')
  @UseInterceptors(FilesInterceptor('files', 10))
  async ingestFiles(
    @Param('loggerType') loggerType: string,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ): Promise<BulkIngestionResponse> {
    // Validate files presence
    if (!files || files.length === 0) {
      throw new BadRequestException(
        'No files uploaded. Use form field "files".',
      );
    }

    this.logger.log(
      `Bulk ingestion request: type=${loggerType}, fileCount=${files.length}`,
    );

    const results: FileIngestionResult[] = [];
    let successCount = 0;
    let errorCount = 0;
    let totalRecordsInserted = 0;

    // Process files sequentially (errors are caught per-file, not thrown)
    for (const file of files) {
      this.logger.log(
        `Processing file: ${file.originalname}, size=${file.size} bytes`,
      );

      // Construct filename with logger type hint for parser selection
      const filename = `${loggerType}_${file.originalname}`;

      try {
        const result: IngestionResult = await this.ingestionService.ingestFile(
          filename,
          file.buffer,
        );

        if (result.success) {
          successCount++;
          totalRecordsInserted += result.recordsInserted;
        } else {
          errorCount++;
        }

        results.push({
          filename: file.originalname,
          success: result.success,
          parserUsed: result.parserUsed,
          recordsInserted: result.recordsInserted,
          recordsProcessed: result.recordsProcessed,
          error: result.errors.length > 0 ? result.errors[0] : undefined,
        });

        this.logger.log(
          `File ${file.originalname}: ${result.recordsInserted}/${result.recordsProcessed} records in ${result.durationMs}ms`,
        );
      } catch (error) {
        // Catch errors per-file and add to results (don't throw)
        errorCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';

        results.push({
          filename: file.originalname,
          success: false,
          error: errorMessage,
        });

        this.logger.error(
          `Failed to ingest ${file.originalname}: ${errorMessage}`,
        );
      }
    }

    this.logger.log(
      `Bulk ingestion complete: ${successCount} succeeded, ${errorCount} failed, ${totalRecordsInserted} total records`,
    );

    // Always return 201 with the results (even if all files failed)
    return {
      successCount,
      errorCount,
      totalRecordsInserted,
      results,
    };
  }

  /**
   * List supported parser types
   *
   * @example
   * GET /ingest/parsers -> [{ name: 'goodwe', description: '...' }]
   */
  // Uncomment when needed:
  // @Get('parsers')
  // getSupportedParsers() {
  //   return this.ingestionService.getSupportedParsers();
  // }
}
