/**
 * UnifiedMeasurementDTO
 *
 * This DTO represents the canonical format for all solar measurement data,
 * regardless of the source logger/inverter brand.
 *
 * Design Philosophy:
 * - "Golden Metrics" (activePowerWatts, energyDailyKwh, irradiance) are extracted
 *   to top-level columns for fast time-series queries and plotting.
 * - All other heterogeneous data (voltages, currents, temperatures, error codes)
 *   goes into the `metadata` JSONB field for flexibility without schema migrations.
 */
export class UnifiedMeasurementDTO {
  /**
   * Timestamp of the measurement in UTC.
   * This forms part of the composite primary key.
   */
  timestamp: Date;

  /**
   * Logger/Inverter serial number or unique identifier.
   * This forms part of the composite primary key.
   */
  loggerId: string;

  /**
   * Golden Metric: Instantaneous AC power output in Watts.
   * Primary metric for real-time monitoring dashboards.
   */
  activePowerWatts?: number | null;

  /**
   * Golden Metric: Cumulative energy generated today in kWh.
   * Resets daily, useful for daily production tracking.
   */
  energyDailyKwh?: number | null;

  /**
   * Golden Metric: Solar irradiance in W/m².
   * Critical for performance ratio calculations.
   */
  irradiance?: number | null;

  /**
   * Flexible JSONB field for all other metrics.
   * Examples: DC voltages, string currents, temperatures, error codes, etc.
   *
   * Structure varies by logger brand but might include:
   * {
   *   "dcVoltage1": 380.5,
   *   "dcCurrent1": 8.2,
   *   "temperature": 45.3,
   *   "gridFrequency": 50.01,
   *   "errorCode": null,
   *   "rawFields": { ... }  // Original unmapped fields
   * }
   */
  metadata?: Record<string, unknown>;
}
