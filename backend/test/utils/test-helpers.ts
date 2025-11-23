import { UnifiedMeasurementDTO } from '../../src/ingestion/dto/unified-measurement.dto';

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
