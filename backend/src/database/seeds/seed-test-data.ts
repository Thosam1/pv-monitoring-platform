/**
 * Seed Test Data for AI Analytics Testing
 *
 * Generates realistic PV monitoring data for testing MCP tools:
 * - list_loggers: Multiple loggers to discover
 * - analyze_inverter_health: Anomalies to detect
 * - get_power_curve: Multi-day timeseries
 * - compare_loggers: Multiple loggers for comparison
 * - calculate_financial_savings: Energy data for financial calculations
 * - calculate_performance_ratio: Power + irradiance for efficiency
 * - forecast_production: Historical data for forecasting
 * - diagnose_error_codes: Error codes in metadata for diagnostics
 *
 * Run: npx ts-node src/database/seeds/seed-test-data.ts
 */

import { DataSource } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Measurement } from '../entities/measurement.entity';

// Database connection (matches docker-compose.yml)
const dataSource = new DataSource({
  type: 'postgres',
  host: 'localhost',
  port: 5432,
  username: 'admin',
  password: 'admin',
  database: 'pv_db',
  entities: [Measurement],
  synchronize: false,
});

// Logger configurations
interface ErrorConfig {
  code: string;
  days: number[]; // Days (1-7) when error occurs
  hours: number[]; // Hours when error occurs
}

interface LoggerConfig {
  id: string;
  type: string;
  peakPower: number;
  anomalyDays: number[]; // Days with daytime outages (1-7)
  errors: ErrorConfig[]; // Error codes to inject
}

// Context for measurement generation
interface MeasurementContext {
  timestamp: Date;
  config: LoggerConfig;
  dayOfWeek: number;
  dailyEnergy: number;
  solarFactor: number;
  variation: number;
  irradiance: number;
}

const LOGGERS: LoggerConfig[] = [
  {
    id: 'GW-INV-001',
    type: 'goodwe',
    peakPower: 5000,
    anomalyDays: [],
    errors: [],
  },
  {
    id: 'GW-INV-002',
    type: 'goodwe',
    peakPower: 4800,
    anomalyDays: [2, 4, 6],
    errors: [
      { code: 'E001', days: [2, 4], hours: [9, 10] }, // Grid voltage issues
      { code: 'E004', days: [6], hours: [12, 13, 14] }, // Overtemperature
    ],
  },
  {
    id: 'LTI-INV-001',
    type: 'lti',
    peakPower: 6000,
    anomalyDays: [],
    errors: [{ code: 'F01', days: [3], hours: [8, 9] }], // Communication timeout
  },
  {
    id: 'MEIER-INV-001',
    type: 'meier',
    peakPower: 5500,
    anomalyDays: [],
    errors: [{ code: 'W100', days: [1, 2, 3], hours: [7, 8] }], // Low production warning
  },
  {
    id: 'SD-INV-001',
    type: 'smartdog',
    peakPower: 4500,
    anomalyDays: [3, 5],
    errors: [{ code: 'ERR_TEMP', days: [5], hours: [11, 12] }], // Temperature sensor fault
  },
];

const DAYS_OF_DATA = 7;
const INTERVAL_MINUTES = 5;

/**
 * Generate a bell curve value for solar production.
 * Peak at solar noon (13:00), zero before 6:00 and after 20:00.
 */
function getSolarFactor(hour: number): number {
  if (hour < 6 || hour >= 20) return 0;

  // Bell curve centered at 13:00 (solar noon)
  const peakHour = 13;
  const spread = 4; // Hours from peak to ~15% of max
  const factor = Math.exp(
    -Math.pow(hour - peakHour, 2) / (2 * spread * spread),
  );

  return factor;
}

/**
 * Generate irradiance based on time of day with some variation.
 */
function getIrradiance(hour: number, variation: number): number {
  const baseFactor = getSolarFactor(hour);
  if (baseFactor === 0) return 0;

  const maxIrradiance = 1000; // W/m² at peak
  const irradiance = maxIrradiance * baseFactor * (0.9 + variation * 0.2);

  return Math.round(irradiance * 10) / 10;
}

/**
 * Check if this timestamp should be an anomaly (daytime outage).
 */
function isAnomaly(
  date: Date,
  dayOfWeek: number,
  anomalyDays: number[],
): boolean {
  if (!anomalyDays.includes(dayOfWeek)) return false;

  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();

  // Create anomaly window: 10:00-11:00 on anomaly days
  return hour === 10 && minute >= 0 && minute < 60;
}

/**
 * Get error code for this timestamp if any.
 */
function getErrorCode(
  date: Date,
  dayOfWeek: number,
  errors: ErrorConfig[],
): string | null {
  const hour = date.getUTCHours();

  for (const error of errors) {
    if (error.days.includes(dayOfWeek) && error.hours.includes(hour)) {
      return error.code;
    }
  }

  return null;
}

/**
 * Calculate power value considering anomalies.
 */
function calculatePower(ctx: MeasurementContext): number | null {
  if (ctx.solarFactor <= 0) return null;

  if (isAnomaly(ctx.timestamp, ctx.dayOfWeek, ctx.config.anomalyDays)) {
    return 0; // Outage: power is 0 but irradiance is still present
  }

  const power =
    ctx.config.peakPower * ctx.solarFactor * (0.85 + ctx.variation * 0.15);
  return Math.round(power);
}

/**
 * Build metadata object with optional error code.
 */
function buildMetadata(
  ctx: MeasurementContext,
  power: number | null,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    temperature:
      ctx.solarFactor > 0
        ? 25 + ctx.solarFactor * 20 + ctx.variation * 5
        : null,
    voltage: ctx.solarFactor > 0 ? 350 + ctx.variation * 30 : null,
    current: power ? power / 350 : null,
  };

  const errorCode = getErrorCode(
    ctx.timestamp,
    ctx.dayOfWeek,
    ctx.config.errors,
  );
  if (errorCode) {
    metadata.errorCode = errorCode;
    metadata.errorTimestamp = ctx.timestamp.toISOString();
  }

  return metadata;
}

/**
 * Create a single measurement record.
 */
function createMeasurement(
  ctx: MeasurementContext,
  power: number | null,
): Measurement {
  const measurement = new Measurement();
  measurement.timestamp = ctx.timestamp;
  measurement.loggerId = ctx.config.id;
  measurement.loggerType = ctx.config.type;
  measurement.activePowerWatts = power;
  measurement.energyDailyKwh =
    ctx.solarFactor > 0 ? Math.round(ctx.dailyEnergy * 100) / 100 : null;
  measurement.irradiance = ctx.irradiance > 0 ? ctx.irradiance : null;
  measurement.metadata = buildMetadata(ctx, power);

  return measurement;
}

/**
 * Process a single time interval and generate a measurement.
 */
function processInterval(
  config: LoggerConfig,
  startDate: Date,
  day: number,
  hour: number,
  minute: number,
  dailyEnergy: number,
): { measurement: Measurement; updatedEnergy: number } {
  const timestamp = new Date(startDate);
  timestamp.setUTCDate(startDate.getUTCDate() + day);
  timestamp.setUTCHours(hour, minute, 0, 0);

  const variation = Math.random();
  const hourDecimal = hour + minute / 60;
  const solarFactor = getSolarFactor(hourDecimal);
  const irradiance = getIrradiance(hourDecimal, variation);

  const ctx: MeasurementContext = {
    timestamp,
    config,
    dayOfWeek: day + 1,
    dailyEnergy,
    solarFactor,
    variation,
    irradiance,
  };

  const power = calculatePower(ctx);
  let updatedEnergy = dailyEnergy;

  // Accumulate energy (kWh) - power * time interval
  if (power && power > 0) {
    updatedEnergy += (power * INTERVAL_MINUTES) / 60 / 1000;
    ctx.dailyEnergy = updatedEnergy;
  }

  const measurement = createMeasurement(ctx, power);

  return { measurement, updatedEnergy };
}

/**
 * Generate measurements for a single day.
 */
function generateDayData(
  config: LoggerConfig,
  startDate: Date,
  day: number,
): Measurement[] {
  const measurements: Measurement[] = [];
  let dailyEnergy = 0;

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += INTERVAL_MINUTES) {
      const { measurement, updatedEnergy } = processInterval(
        config,
        startDate,
        day,
        hour,
        minute,
        dailyEnergy,
      );
      dailyEnergy = updatedEnergy;
      measurements.push(measurement);
    }
  }

  return measurements;
}

/**
 * Generate measurements for a single logger.
 */
function generateLoggerData(
  config: LoggerConfig,
  startDate: Date,
): Measurement[] {
  const measurements: Measurement[] = [];

  for (let day = 0; day < DAYS_OF_DATA; day++) {
    const dayMeasurements = generateDayData(config, startDate, day);
    measurements.push(...dayMeasurements);
  }

  return measurements;
}

/**
 * Insert measurements in batches.
 */
async function insertMeasurements(
  repository: ReturnType<typeof dataSource.getRepository<Measurement>>,
  measurements: Measurement[],
): Promise<void> {
  const batchSize = 1000;
  for (let i = 0; i < measurements.length; i += batchSize) {
    const batch = measurements.slice(i, i + batchSize);
    await repository
      .createQueryBuilder()
      .insert()
      .into(Measurement)
      .values(batch as QueryDeepPartialEntity<Measurement>[])
      .orUpdate(
        [
          'activePowerWatts',
          'energyDailyKwh',
          'irradiance',
          'metadata',
          'loggerType',
        ],
        ['loggerId', 'timestamp'],
      )
      .execute();
  }
}

/**
 * Count and log statistics for a logger.
 */
function logStatistics(loggerId: string, measurements: Measurement[]): void {
  const anomalyCount = measurements.filter(
    (m) => m.activePowerWatts === 0 && m.irradiance && m.irradiance > 50,
  ).length;

  const errorCount = measurements.filter((m) => m.metadata?.errorCode).length;

  console.log(
    `  Inserted ${measurements.length} records (${anomalyCount} anomalies, ${errorCount} errors)`,
  );
}

/**
 * Process a single logger: generate and insert data.
 */
async function processLogger(
  logger: LoggerConfig,
  startDate: Date,
  repository: ReturnType<typeof dataSource.getRepository<Measurement>>,
): Promise<number> {
  console.log(`\nGenerating data for ${logger.id} (${logger.type})...`);

  const measurements = generateLoggerData(logger, startDate);
  console.log(`  Generated ${measurements.length} measurements`);

  await insertMeasurements(repository, measurements);
  logStatistics(logger.id, measurements);

  return measurements.length;
}

/**
 * Main seed function.
 */
async function seedTestData(): Promise<void> {
  console.log('Connecting to database...');
  await dataSource.initialize();

  const repository = dataSource.getRepository(Measurement);

  // Calculate start date (7 days ago from now)
  const startDate = new Date();
  startDate.setUTCDate(startDate.getUTCDate() - DAYS_OF_DATA);
  startDate.setUTCHours(0, 0, 0, 0);

  console.log(
    `Generating data from ${startDate.toISOString()} for ${DAYS_OF_DATA} days`,
  );

  let totalInserted = 0;

  for (const logger of LOGGERS) {
    totalInserted += await processLogger(logger, startDate, repository);
  }

  console.log(`\n========================================`);
  console.log(`Total records inserted: ${totalInserted}`);
  console.log(`Loggers created: ${LOGGERS.map((l) => l.id).join(', ')}`);
  console.log(`========================================`);

  await dataSource.destroy();
  console.log('\nDatabase connection closed.');
}

// Run the seeder
void (async () => {
  try {
    await seedTestData();
    console.log('\nSeed completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
})();
