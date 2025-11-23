import { UnifiedMeasurementDTO } from '../../src/ingestion/dto/unified-measurement.dto';
import { createCsvBuffer } from './csv-builder';

/**
 * Helper to collect all DTOs from async generator
 */
export async function collectDTOs(
  generator: AsyncGenerator<UnifiedMeasurementDTO>,
): Promise<UnifiedMeasurementDTO[]> {
  const results: UnifiedMeasurementDTO[] = [];
  for await (const dto of generator) {
    results.push(dto);
  }
  return results;
}

/**
 * Parser interface for parseAndCollect helper
 */
interface Parser {
  parse(buffer: Buffer): AsyncGenerator<UnifiedMeasurementDTO>;
}

/**
 * Higher-level helper: parse CSV lines and collect results
 * Combines createCsvBuffer + collectDTOs in one call
 */
export async function parseAndCollect(
  parser: Parser,
  lines: string[],
): Promise<UnifiedMeasurementDTO[]> {
  const buffer = createCsvBuffer(lines);
  return collectDTOs(parser.parse(buffer));
}
