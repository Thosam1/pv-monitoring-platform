/**
 * Demo Data Seeder - Optimized for December 5th, 2025 Presentation at 5pm
 *
 * Generates ~31 days of realistic PV monitoring data with specific scenarios
 * designed to showcase all 4 AI flows:
 * - Morning Briefing: Fleet overview with mixed health
 * - Financial Report: Strong earnings from top performer
 * - Performance Audit: Clear differences between loggers
 * - Health Check: Recent anomalies in the last 7 days
 *
 * Logger personalities:
 * - GW-INV-001 (GoodWe): "The Star Performer" - Perfect data, ~30 kWh/day
 * - LTI-INV-001 (LTI): "The Problem Child" - Recent outages (Dec 1-5), error codes
 * - MEIER-INV-001 (Meier): "The Underperformer" - Declining trend, ~13 kWh/day
 * - SD-INV-001 (SmartDog): "The Variable One" - Spiky data, cloud effects
 * - MBMET-001 (MBMET): "The Weather Station" - Irradiance & temperature only
 *
 * Date Coverage:
 * - Demo Date/Time: December 5th, 2025 at 5pm (17:00 UTC)
 * - Data Range: November 5th - December 5th 17:00, 2025
 * - Full days: Nov 5 - Dec 4 (30 days)
 * - Partial day: Dec 5 (6am - 5pm only, for "live" demo)
 * - "Last 7 days" = November 29th - December 5th
 *
 * Run: npm run seed:demo
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

// Demo date/time: Friday, December 5th, 2025 at 5pm UTC
const DEMO_DATETIME = new Date('2025-12-05T17:00:00Z');
const INTERVAL_MINUTES = 5;

// Calculate date range
// DEMO_END is the exact demo time (Dec 5 at 17:00)
const DEMO_END = new Date(DEMO_DATETIME);

// DEMO_START is 30 full days before Dec 5 = Nov 5
const DEMO_START = new Date('2025-11-05T00:00:00Z');

// For day numbering: days 1-30 are Nov 5 - Dec 4, day 31 is Dec 5 (partial)
const TOTAL_DAYS = 31;

// Logger personality types
type PersonalityType =
  | 'starPerformer'
  | 'problemChild'
  | 'underperformer'
  | 'variable'
  | 'meteoStation';

interface LoggerConfig {
  id: string;
  type: string;
  peakPower: number;
  personality: PersonalityType;
  description: string;
}

const LOGGERS: LoggerConfig[] = [
  {
    id: 'GW-INV-001',
    type: 'goodwe',
    peakPower: 12000, // 12kW peak for ~30 kWh/day
    personality: 'starPerformer',
    description: 'The Star Performer',
  },
  {
    id: 'LTI-INV-001',
    type: 'lti',
    peakPower: 10000, // 10kW peak
    personality: 'problemChild',
    description: 'The Problem Child',
  },
  {
    id: 'MEIER-INV-001',
    type: 'meier',
    peakPower: 10000, // 10kW but capped to 70%
    personality: 'underperformer',
    description: 'The Underperformer',
  },
  {
    id: 'SD-INV-001',
    type: 'smartdog',
    peakPower: 9000, // 9kW with high variance
    personality: 'variable',
    description: 'The Variable One',
  },
  {
    id: 'MBMET-001',
    type: 'mbmet',
    peakPower: 0, // No power - meteo station
    personality: 'meteoStation',
    description: 'The Weather Station',
  },
];

// Problem Child: Recent outage days (in the last 7 days for health check visibility)
// Days 25-31 = Nov 29 - Dec 5 (includes demo day for visible issues)
const PROBLEM_CHILD_OUTAGE_DAYS = new Set([25, 26, 27, 28, 29, 30, 31]); // Nov 29 - Dec 5
const PROBLEM_CHILD_OUTAGE_START_HOUR = 9;
const PROBLEM_CHILD_OUTAGE_END_HOUR = 11;
const PROBLEM_CHILD_ERROR_CODES = ['E-201', 'E-305'];

// Underperformer: Declining trend parameters
const UNDERPERFORMER_START_CAP = 0.75; // 75% capacity at start
const UNDERPERFORMER_END_CAP = 0.55; // 55% capacity by end (declining)

// Variable: Volatility parameters
const VARIABLE_MIN_FACTOR = 0.5;
const VARIABLE_MAX_FACTOR = 1.15;

/**
 * Generate a bell curve value for solar production.
 */
function getSolarFactor(hour: number): number {
  if (hour < 6 || hour >= 20) return 0;
  const peakHour = 12.5; // Solar noon
  const spread = 3.5;
  return Math.exp(-Math.pow(hour - peakHour, 2) / (2 * spread * spread));
}

/**
 * Generate irradiance with weather variation.
 */
function getIrradiance(
  hour: number,
  dayNumber: number,
  seedValue: number,
): number {
  const baseFactor = getSolarFactor(hour);
  if (baseFactor === 0) return 0;

  // Weather pattern: mostly sunny with some cloudy days
  const isCloudyDay = dayNumber % 5 === 0 || dayNumber % 7 === 3;
  const weatherFactor = isCloudyDay
    ? 0.5 + seedValue * 0.3
    : 0.85 + seedValue * 0.15;

  const maxIrradiance = 900; // Winter max
  return Math.round(maxIrradiance * baseFactor * weatherFactor);
}

/**
 * Get temperature based on time and irradiance.
 */
function getTemperature(
  hour: number,
  irradiance: number,
  seedValue: number,
): { cellTemp: number; ambientTemp: number } {
  // Winter ambient: 5-15°C
  const baseAmbient = 8 + seedValue * 4;
  const dayBonus = getSolarFactor(hour) * 5;
  const ambientTemp = Math.round((baseAmbient + dayBonus) * 10) / 10;

  // Cell temp rises with irradiance
  const cellTemp =
    irradiance > 0
      ? Math.round((ambientTemp + irradiance * 0.03 + seedValue * 5) * 10) / 10
      : ambientTemp;

  return { cellTemp, ambientTemp };
}

/**
 * Check if this is a Problem Child outage window.
 */
function isProblemChildOutage(dayNumber: number, hour: number): boolean {
  if (!PROBLEM_CHILD_OUTAGE_DAYS.has(dayNumber)) return false;
  return (
    hour >= PROBLEM_CHILD_OUTAGE_START_HOUR &&
    hour < PROBLEM_CHILD_OUTAGE_END_HOUR
  );
}

/**
 * Get underperformer capacity based on day (declining trend).
 */
function getUnderperformerCap(dayNumber: number): number {
  const progress = (dayNumber - 1) / (TOTAL_DAYS - 1);
  return (
    UNDERPERFORMER_START_CAP -
    progress * (UNDERPERFORMER_START_CAP - UNDERPERFORMER_END_CAP)
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
  if (personality === 'meteoStation') {
    return { power: null, errorCode: null }; // Meteo station has no power
  }

  if (solarFactor <= 0) {
    return { power: null, errorCode: null };
  }

  switch (personality) {
    case 'starPerformer': {
      // Perfect bell curve, minimal variation, consistent ~30 kWh/day
      const variation = 0.97 + seedValue * 0.06; // 97-103%
      const power = Math.round(peakPower * solarFactor * variation);
      return { power, errorCode: null };
    }

    case 'problemChild': {
      // Zero power during recent outage windows with error codes
      if (isProblemChildOutage(dayNumber, hour)) {
        const errorCode =
          PROBLEM_CHILD_ERROR_CODES[
            Math.floor(seedValue * PROBLEM_CHILD_ERROR_CODES.length)
          ];
        return { power: 0, errorCode };
      }
      const variation = 0.88 + seedValue * 0.15;
      const power = Math.round(peakPower * solarFactor * variation);
      return { power, errorCode: null };
    }

    case 'underperformer': {
      // Declining capacity over time
      const cap = getUnderperformerCap(dayNumber);
      const variation = 0.9 + seedValue * 0.12;
      const power = Math.round(peakPower * cap * solarFactor * variation);
      return { power, errorCode: null };
    }

    case 'variable': {
      // High volatility - cloud simulation
      const cloudFactor =
        VARIABLE_MIN_FACTOR +
        seedValue * (VARIABLE_MAX_FACTOR - VARIABLE_MIN_FACTOR);
      // Add rapid fluctuations
      const spike = Math.sin(seedValue * Math.PI * 8) * 0.25;
      const totalFactor = Math.max(0.2, Math.min(1.2, cloudFactor + spike));
      const power = Math.round(peakPower * solarFactor * totalFactor);
      return { power, errorCode: null };
    }

    default:
      return { power: null, errorCode: null };
  }
}

/**
 * Build metadata object with error codes and additional info.
 */
function buildMetadata(
  config: LoggerConfig,
  solarFactor: number,
  power: number | null,
  errorCode: string | null,
  timestamp: Date,
  temps: { cellTemp: number; ambientTemp: number },
  seedValue: number,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  if (config.personality === 'meteoStation') {
    // Meteo station: temperature data only
    metadata.cellTemperature = temps.cellTemp;
    metadata.ambientTemperature = temps.ambientTemp;
    metadata.humidity = Math.round(50 + seedValue * 30);
    return metadata;
  }

  // Inverter metadata
  if (solarFactor > 0) {
    metadata.temperature = temps.cellTemp;
    metadata.voltage = 350 + seedValue * 50;
    metadata.current = power ? Math.round((power / 350) * 100) / 100 : 0;
    metadata.frequency = 50 + (seedValue - 0.5) * 0.2;
  }

  if (errorCode) {
    metadata.errorCode = errorCode;
    metadata.errorTimestamp = timestamp.toISOString();
    metadata.errorDescription =
      errorCode === 'E-201'
        ? 'Inverter fault detected'
        : 'Grid disconnect event';
  }

  return metadata;
}

/**
 * Generate measurements for a single day.
 * Day 31 (Dec 5) is a partial day - only generates data up to 17:00 (5pm demo time).
 */
function generateDayData(
  config: LoggerConfig,
  dayNumber: number,
): Measurement[] {
  const measurements: Measurement[] = [];
  let dailyEnergy = 0;

  const daySeed = dayNumber * 1000 + (config.id.charCodeAt(0) ?? 0);

  // For day 31 (Dec 5), only generate data up to 17:00 (demo time)
  const isPartialDay = dayNumber === TOTAL_DAYS;
  const maxHour = isPartialDay ? 17 : 24;

  for (let hour = 0; hour < maxHour; hour++) {
    // For the last hour of partial day, only go up to :00 (not beyond 17:00)
    const maxMinute = isPartialDay && hour === 16 ? 60 : 60;

    for (let minute = 0; minute < maxMinute; minute += INTERVAL_MINUTES) {
      const timestamp = new Date(DEMO_START);
      timestamp.setUTCDate(DEMO_START.getUTCDate() + dayNumber - 1);
      timestamp.setUTCHours(hour, minute, 0, 0);

      const intervalSeed = daySeed + hour * 100 + minute;
      const seedValue = (Math.sin(intervalSeed) + 1) / 2;

      // Skip ~3% of intervals for realism (but not during outages - we want those)
      const isOutageWindow =
        config.personality === 'problemChild' &&
        isProblemChildOutage(dayNumber, hour);
      if (!isOutageWindow && seedValue < 0.03) {
        continue;
      }

      const hourDecimal = hour + minute / 60;
      const solarFactor = getSolarFactor(hourDecimal);
      const irradiance = getIrradiance(hourDecimal, dayNumber, seedValue);
      const temps = getTemperature(hourDecimal, irradiance, seedValue);

      const { power, errorCode } = calculatePower(
        config.personality,
        config.peakPower,
        solarFactor,
        dayNumber,
        hour,
        seedValue,
      );

      // Accumulate energy for inverters
      if (power && power > 0) {
        dailyEnergy += (power * INTERVAL_MINUTES) / 60 / 1000;
      }

      const measurement = new Measurement();
      measurement.timestamp = timestamp;
      measurement.loggerId = config.id;
      measurement.loggerType = config.type;
      measurement.activePowerWatts = power;
      measurement.energyDailyKwh =
        config.personality !== 'meteoStation' && solarFactor > 0
          ? Math.round(dailyEnergy * 100) / 100
          : null;
      measurement.irradiance = irradiance > 0 ? irradiance : null;
      measurement.metadata = buildMetadata(
        config,
        solarFactor,
        power,
        errorCode,
        timestamp,
        temps,
        seedValue,
      );

      measurements.push(measurement);
    }
  }

  return measurements;
}

/**
 * Generate all measurements for a logger.
 * Generates 30 full days (Nov 5 - Dec 4) plus partial day 31 (Dec 5 up to 17:00).
 */
function generateLoggerData(config: LoggerConfig): Measurement[] {
  const measurements: Measurement[] = [];

  for (let day = 1; day <= TOTAL_DAYS; day++) {
    measurements.push(...generateDayData(config, day));
  }

  return measurements;
}

/**
 * Insert measurements in batches with upsert.
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
 * Calculate and log statistics for a logger.
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

  const avgDailyEnergy = totalEnergy / TOTAL_DAYS;

  console.log(`  Records: ${measurements.length.toLocaleString()}`);

  if (config.personality !== 'meteoStation') {
    console.log(`  Peak Power: ${(peakPower / 1000).toFixed(1)} kW`);
    console.log(`  Total Energy: ${totalEnergy.toFixed(0)} kWh (~31 days)`);
    console.log(`  Avg Daily: ${avgDailyEnergy.toFixed(1)} kWh/day`);
  }

  if (anomalyCount > 0 || errorCount > 0) {
    console.log(`  Anomalies: ${anomalyCount}, Error Events: ${errorCount}`);
  }
}

/**
 * Main seed function.
 */
async function seedDemoData(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('  PV Monitoring Platform - Demo Data Seeder');
  console.log('═'.repeat(60));
  console.log(
    `\n  Demo Time: ${DEMO_DATETIME.toISOString()} (presentation time)`,
  );
  console.log(
    `  Data Range: ${DEMO_START.toISOString().split('T')[0]} to ${DEMO_END.toISOString()}`,
  );
  console.log(`  Days of Data: ${TOTAL_DAYS} (30 full + 1 partial)`);
  console.log(`  Loggers: ${LOGGERS.length}`);

  console.log('\n  Connecting to database...');
  await dataSource.initialize();
  const repository = dataSource.getRepository(Measurement);

  // Clear existing demo data
  console.log('  Clearing existing demo logger data...\n');
  await repository
    .createQueryBuilder()
    .delete()
    .from(Measurement)
    .where('loggerId IN (:...ids)', { ids: LOGGERS.map((l) => l.id) })
    .execute();

  let totalInserted = 0;

  for (const logger of LOGGERS) {
    console.log('─'.repeat(50));
    console.log(`${logger.id} (${logger.type})`);
    console.log(`"${logger.description}"`);
    console.log('─'.repeat(50));

    const measurements = generateLoggerData(logger);
    await insertMeasurements(repository, measurements);
    logStatistics(logger, measurements);

    totalInserted += measurements.length;
    console.log();
  }

  console.log('═'.repeat(60));
  console.log('  Summary');
  console.log('═'.repeat(60));
  console.log(`  Total Records: ${totalInserted.toLocaleString()}`);
  console.log(`  Loggers: ${LOGGERS.map((l) => l.id).join(', ')}`);
  console.log(
    `  Date Range: ${DEMO_START.toISOString().split('T')[0]} to ${DEMO_END.toISOString()}`,
  );
  console.log(`\n  Demo Scenarios Ready:`);
  console.log(`    ✓ Morning Briefing: Fleet with mixed health status`);
  console.log(
    `    ✓ Health Check: LTI-INV-001 has ${PROBLEM_CHILD_OUTAGE_DAYS.size} days of outages`,
  );
  console.log(`    ✓ Performance Audit: Clear ranking GW > SD > LTI > MEIER`);
  console.log(`    ✓ Financial Report: GW-INV-001 ~$180 savings (~31 days)`);
  console.log('═'.repeat(60));

  await dataSource.destroy();
  console.log('\n  Database connection closed.\n');
}

// Run the seeder
void (async () => {
  try {
    await seedDemoData();
    console.log('Demo data seeded successfully!');
    console.log('\nTo test, run: npm run start:dev');
    console.log('Then open: http://localhost:5173\n');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
})();
