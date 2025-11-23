import {
  Controller,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IngestionService } from './ingestion.service';

/**
 * Response DTO for ingestion endpoint
 */
interface IngestionResponse {
  success: boolean;
  count: number;
  message: string;
  details?: {
    filename: string;
    parserUsed: string;
    recordsProcessed: number;
    recordsSkipped: number;
    durationMs: number;
    errors?: string[];
  };
}

/**
 * IngestionController
 *
 * Exposes file upload endpoints for data ingestion.
 *
 * Usage:
 *   POST /ingest/goodwe
 *   Content-Type: multipart/form-data
 *   Body: file=<csv_file>
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
   * Ingest a file for a specific logger type
   *
   * @param loggerType - Parser identifier (e.g., 'goodwe', 'sma')
   * @param file - Uploaded CSV file
   * @returns Ingestion result with record count
   *
   * @example
   * curl -X POST http://localhost:3000/ingest/goodwe \
   *   -F "file=@/path/to/goodwe_data.csv"
   */
  @Post(':loggerType')
  @UseInterceptors(FileInterceptor('file'))
  async ingestFile(
    @Param('loggerType') loggerType: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<IngestionResponse> {
    // Validate file presence
    if (!file) {
      throw new BadRequestException('No file uploaded. Use form field "file".');
    }

    // Validate file type (basic check)
    const allowedMimeTypes = [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/octet-stream', // Sometimes CSV is sent as this
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      this.logger.warn(`Unexpected mime type: ${file.mimetype}, proceeding anyway`);
    }

    this.logger.log(
      `Ingestion request: type=${loggerType}, file=${file.originalname}, size=${file.size} bytes`,
    );

    // Construct filename with logger type hint for parser selection
    const filename = `${loggerType}_${file.originalname}`;

    try {
      const result = await this.ingestionService.ingestFile(filename, file.buffer);

      const response: IngestionResponse = {
        success: result.success,
        count: result.recordsInserted,
        message: result.success
          ? `Successfully ingested ${result.recordsInserted} records`
          : `Ingestion completed with issues: ${result.errors.join('; ')}`,
        details: {
          filename: file.originalname,
          parserUsed: result.parserUsed,
          recordsProcessed: result.recordsProcessed,
          recordsSkipped: result.recordsSkipped,
          durationMs: result.durationMs,
          errors: result.errors.length > 0 ? result.errors.slice(0, 10) : undefined, // Limit errors in response
        },
      };

      this.logger.log(
        `Ingestion complete: ${result.recordsInserted}/${result.recordsProcessed} records in ${result.durationMs}ms`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `Ingestion failed for ${file.originalname}`,
        error instanceof Error ? error.stack : error,
      );

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Ingestion failed',
      );
    }
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
