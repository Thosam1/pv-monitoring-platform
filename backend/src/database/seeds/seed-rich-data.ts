/**
 * Rich Demo Data Seeder
 *
 * Generates 30 days of realistic PV monitoring data with 4 distinct logger personalities:
 * - GW-INV-001 (GoodWe): "The Perfect Inverter" - Clean bell curves, no issues
 * - LTI-INV-001 (LTI): "The Problem Child" - Zero power drops with error codes
 * - MEIER-INV-001 (Meier): "The Underperformer" - Capped at 70% capacity
 * - SD-INV-001 (SmartDog): "The Variable One" - High volatility (cloud simulation)
 *
 * Run: npx ts-node src/database/seeds/seed-rich-data.ts
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

// Fixed demo date range (30 days in January 2025)
const DEMO_START = new Date('2025-01-01T00:00:00Z');
const DAYS_OF_DATA = 30;
const INTERVAL_MINUTES = 5;

// Logger personality types
type PersonalityType =
  | 'perfect'
  | 'problemChild'
  | 'underperformer'
  | 'variable';

interface LoggerConfig {
  id: string;
  type: string;
  peakPower: number;
  personality: PersonalityType;
}

const LOGGERS: LoggerConfig[] = [
  {
    id: 'GW-INV-001',
    type: 'goodwe',
    peakPower: 5000,
    personality: 'perfect',
  },
  {
    id: 'LTI-INV-001',
    type: 'lti',
    peakPower: 6000,
    personality: 'problemChild',
  },
  {
    id: 'MEIER-INV-001',
    type: 'meier',
    peakPower: 5500,
    personality: 'underperformer',
  },
  {
    id: 'SD-INV-001',
    type: 'smartdog',
    peakPower: 4500,
    personality: 'variable',
  },
];

// Problem Child: Days with zero power drops (1-indexed)
const PROBLEM_CHILD_OUTAGE_DAYS = [3, 5, 7, 12, 18, 25];
const PROBLEM_CHILD_OUTAGE_START_HOUR = 10;
const PROBLEM_CHILD_OUTAGE_END_HOUR = 14;
const PROBLEM_CHILD_ERROR_CODE = 'E-501';

// Underperformer: Capacity cap
const UNDERPERFORMER_CAP = 0.7; // 70% of peak

// Variable: Volatility parameters
const VARIABLE_MIN_FACTOR = 0.6;
const VARIABLE_MAX_FACTOR = 1.1;

/**
 * Generate a bell curve value for solar production.
 * Peak at solar noon (13:00), zero before 6:00 and after 20:00.
 */
function getSolarFactor(hour: number): number {
  if (hour < 6 || hour >= 20) return 0;

  const peakHour = 13;
  const spread = 4;
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

  const maxIrradiance = 1000;
  const irradiance = maxIrradiance * baseFactor * (0.9 + variation * 0.2);

  return Math.round(irradiance * 10) / 10;
}

/**
 * Check if this is a Problem Child outage window.
 */
function isProblemChildOutage(dayNumber: number, hour: number): boolean {
  if (!PROBLEM_CHILD_OUTAGE_DAYS.includes(dayNumber)) return false;
  return (
    hour >= PROBLEM_CHILD_OUTAGE_START_HOUR &&
    hour < PROBLEM_CHILD_OUTAGE_END_HOUR
  );
}

/**
 * Calculate power based on personality type.
 */
function calculatePower(
  personality: PersonalityType,
  peakPower: number,
  solarFactor: number,
  dayNumber: number,
  hour: number,
  seedValue: number,
): { power: number | null; errorCode: string | null } {
  if (solarFactor <= 0) {
    return { power: null, errorCode: null };
  }

  switch (personality) {
    case 'perfect': {
      // Perfect bell curve with minimal variation
      const variation = 0.95 + seedValue * 0.1; // 95-105%
      const power = Math.round(peakPower * solarFactor * variation);
      return { power, errorCode: null };
    }

    case 'problemChild': {
      // Zero power during outage windows
      if (isProblemChildOutage(dayNumber, hour)) {
        return { power: 0, errorCode: PROBLEM_CHILD_ERROR_CODE };
      }
      // Normal operation otherwise
      const variation = 0.9 + seedValue * 0.15;
      const power = Math.round(peakPower * solarFactor * variation);
      return { power, errorCode: null };
    }

    case 'underperformer': {
      // Capped at 70% of expected
      const variation = 0.9 + seedValue * 0.15;
      const cappedPower = peakPower * UNDERPERFORMER_CAP;
      const power = Math.round(cappedPower * solarFactor * variation);
      return { power, errorCode: null };
    }

    case 'variable': {
      // High volatility - spiky curves
      const volatility =
        VARIABLE_MIN_FACTOR +
        seedValue * (VARIABLE_MAX_FACTOR - VARIABLE_MIN_FACTOR);
      const spike = Math.sin(seedValue * Math.PI * 4) * 0.2; // Add spikes
      const totalFactor = Math.max(0.3, Math.min(1.2, volatility + spike));
      const power = Math.round(peakPower * solarFactor * totalFactor);
      return { power, errorCode: null };
    }

    default:
      return { power: null, errorCode: null };
  }
}

/**
 * Build metadata object.
 */
function buildMetadata(
  solarFactor: number,
  power: number | null,
  errorCode: string | null,
  timestamp: Date,
  seedValue: number,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    temperature: solarFactor > 0 ? 25 + solarFactor * 20 + seedValue * 5 : null,
    voltage: solarFactor > 0 ? 350 + seedValue * 30 : null,
    current: power ? power / 350 : null,
  };

  if (errorCode) {
    metadata.errorCode = errorCode;
    metadata.errorTimestamp = timestamp.toISOString();
  }

  return metadata;
}

/**
 * Generate measurements for a single day.
 */
function generateDayData(
  config: LoggerConfig,
  dayNumber: number,
): Measurement[] {
  const measurements: Measurement[] = [];
  let dailyEnergy = 0;

  // Seeded random for reproducible "randomness"
  const daySeed = dayNumber * 1000 + config.id.charCodeAt(0);

  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += INTERVAL_MINUTES) {
      const timestamp = new Date(DEMO_START);
      timestamp.setUTCDate(DEMO_START.getUTCDate() + dayNumber - 1);
      timestamp.setUTCHours(hour, minute, 0, 0);

      const intervalSeed = daySeed + hour * 100 + minute;
      const seedValue = (Math.sin(intervalSeed) + 1) / 2; // 0-1 pseudo-random

      const hourDecimal = hour + minute / 60;
      const solarFactor = getSolarFactor(hourDecimal);
      const irradiance = getIrradiance(hourDecimal, seedValue);

      const { power, errorCode } = calculatePower(
        config.personality,
        config.peakPower,
        solarFactor,
        dayNumber,
        hour,
        seedValue,
      );

      // Accumulate energy
      if (power && power > 0) {
        dailyEnergy += (power * INTERVAL_MINUTES) / 60 / 1000;
      }

      const measurement = new Measurement();
      measurement.timestamp = timestamp;
      measurement.loggerId = config.id;
      measurement.loggerType = config.type;
      measurement.activePowerWatts = power;
      measurement.energyDailyKwh =
        solarFactor > 0 ? Math.round(dailyEnergy * 100) / 100 : null;
      measurement.irradiance = irradiance > 0 ? irradiance : null;
      measurement.metadata = buildMetadata(
        solarFactor,
        power,
        errorCode,
        timestamp,
        seedValue,
      );

      measurements.push(measurement);
    }
  }

  return measurements;
}

/**
 * Generate measurements for a single logger.
 */
function generateLoggerData(config: LoggerConfig): Measurement[] {
  const measurements: Measurement[] = [];

  for (let day = 1; day <= DAYS_OF_DATA; day++) {
    const dayMeasurements = generateDayData(config, day);
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
 * Log statistics for a logger.
 */
function logStatistics(
  config: LoggerConfig,
  measurements: Measurement[],
): void {
  const anomalyCount = measurements.filter(
    (m) => m.activePowerWatts === 0 && m.irradiance && m.irradiance > 50,
  ).length;

  const errorCount = measurements.filter((m) => m.metadata?.errorCode).length;

  const peakPower = Math.max(
    ...measurements.map((m) => m.activePowerWatts ?? 0),
  );

  const totalEnergy = measurements.reduce(
    (sum, m) =>
      sum + ((m.activePowerWatts ?? 0) * INTERVAL_MINUTES) / 60 / 1000,
    0,
  );

  console.log(`  Records: ${measurements.length}`);
  console.log(`  Peak Power: ${peakPower}W`);
  console.log(`  Total Energy: ${totalEnergy.toFixed(1)} kWh`);
  console.log(`  Anomalies: ${anomalyCount}, Errors: ${errorCount}`);
}

/**
 * Main seed function.
 */
async function seedRichData(): Promise<void> {
  console.log('='.repeat(50));
  console.log('Rich Demo Data Seeder');
  console.log('='.repeat(50));
  console.log(
    `\nDate Range: ${DEMO_START.toISOString().split('T')[0]} to ${new Date(DEMO_START.getTime() + (DAYS_OF_DATA - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`,
  );
  console.log(`Days: ${DAYS_OF_DATA}`);
  console.log(`Loggers: ${LOGGERS.length}`);
  console.log('\nConnecting to database...');

  await dataSource.initialize();
  const repository = dataSource.getRepository(Measurement);

  // Clear existing demo data for these loggers
  console.log('\nClearing existing data for demo loggers...');
  await repository
    .createQueryBuilder()
    .delete()
    .from(Measurement)
    .where('loggerId IN (:...ids)', { ids: LOGGERS.map((l) => l.id) })
    .execute();

  let totalInserted = 0;

  for (const logger of LOGGERS) {
    console.log(`\n${'-'.repeat(40)}`);
    console.log(
      `${logger.id} (${logger.type}) - "${getPersonalityName(logger.personality)}"`,
    );
    console.log('-'.repeat(40));

    const measurements = generateLoggerData(logger);
    await insertMeasurements(repository, measurements);
    logStatistics(logger, measurements);

    totalInserted += measurements.length;
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary');
  console.log('='.repeat(50));
  console.log(`Total Records: ${totalInserted.toLocaleString()}`);
  console.log(`Loggers: ${LOGGERS.map((l) => l.id).join(', ')}`);
  console.log(
    `Date Range: ${DEMO_START.toISOString().split('T')[0]} (30 days)`,
  );
  console.log('='.repeat(50));

  await dataSource.destroy();
  console.log('\nDatabase connection closed.');
}

function getPersonalityName(personality: PersonalityType): string {
  switch (personality) {
    case 'perfect':
      return 'The Perfect Inverter';
    case 'problemChild':
      return 'The Problem Child';
    case 'underperformer':
      return 'The Underperformer';
    case 'variable':
      return 'The Variable One';
    default:
      return 'Unknown';
  }
}

// Run the seeder
seedRichData()
  .then(() => {
    console.log('\nRich demo data seeded successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
