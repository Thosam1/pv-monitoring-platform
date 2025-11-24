import {
  Entity,
  Column,
  PrimaryColumn,
  Index,
  CreateDateColumn,
} from 'typeorm';

/**
 * Measurement Entity - Hybrid Schema Design
 *
 * This entity implements a hybrid approach optimized for:
 * 1. WRITE SPEED: Minimal columns, bulk inserts, reduced row count (50x vs EAV)
 * 2. READ CONVENIENCE: Golden metrics extracted for fast time-series queries
 * 3. FLEXIBILITY: JSONB metadata absorbs heterogeneous sensor data without migrations
 *
 * Trade-offs:
 * - Sacrifices strict SQL normalization for performance
 * - JSONB queries are slightly slower than column queries, but GIN index mitigates this
 * - Schema evolution is handled in application code, not database migrations
 *
 * Composite Primary Key: [loggerId, timestamp]
 * - Natural key that reflects the domain (one reading per logger per timestamp)
 * - Eliminates need for surrogate ID and associated index
 * - Enables efficient range queries by logger
 */
@Entity('measurements')
@Index('idx_measurements_timestamp_brin', ['timestamp'], {
  // Note: TypeORM doesn't natively support BRIN, we'll create it via migration/raw SQL
  // This creates a B-tree index; BRIN index will be added via synchronize or migration
})
export class Measurement {
  /**
   * Timestamp of the measurement (UTC enforced).
   * Part of composite primary key.
   *
   * Using 'timestamptz' ensures timezone awareness at the database level.
   * All timestamps should be stored and queried in UTC.
   */
  @PrimaryColumn({ type: 'timestamptz' })
  timestamp: Date;

  /**
   * Logger/Inverter serial number.
   * Part of composite primary key.
   *
   * Examples: "GW12345678", "SMA-9876543210"
   */
  @PrimaryColumn({ type: 'varchar', length: 64 })
  loggerId: string;

  /**
   * Logger type identifier.
   * Indicates which parser/strategy was used to ingest this measurement.
   *
   * Values: 'goodwe' | 'lti'
   * Mandatory field - all measurements must have a logger type.
   */
  @Column({ type: 'varchar', length: 20, nullable: false })
  loggerType: string;

  /**
   * Golden Metric: Active power output in Watts.
   *
   * Extracted to top-level column because:
   * - Most frequently queried metric for dashboards
   * - Enables efficient aggregations (AVG, MAX, SUM)
   * - Direct column access is 10-100x faster than JSONB extraction
   */
  @Column({ type: 'float', nullable: true })
  activePowerWatts: number | null;

  /**
   * Golden Metric: Daily energy production in kWh.
   *
   * Extracted because:
   * - Critical for daily/monthly production reports
   * - Often used in billing calculations
   */
  @Column({ type: 'float', nullable: true })
  energyDailyKwh: number | null;

  /**
   * Golden Metric: Solar irradiance in W/m².
   *
   * Extracted because:
   * - Essential for Performance Ratio (PR) calculations
   * - PR = Actual Output / (Irradiance * Capacity * Time)
   */
  @Column({ type: 'float', nullable: true })
  irradiance: number | null;

  /**
   * Flexible JSONB storage for all other metrics.
   *
   * Why JSONB over JSON:
   * - Binary storage is more compact
   * - Supports GIN indexing for fast key/value lookups
   * - Allows containment operators (@>, <@, ?, ?|, ?&)
   *
   * Typical contents:
   * {
   *   "dcVoltage1": 380.5,
   *   "dcVoltage2": 378.2,
   *   "dcCurrent1": 8.2,
   *   "dcCurrent2": 8.1,
   *   "acVoltage": 240.1,
   *   "acCurrent": 12.5,
   *   "frequency": 50.01,
   *   "temperature": 45.3,
   *   "powerFactor": 0.98,
   *   "errorCode": null,
   *   "status": "Normal",
   *   "rawFields": {}  // Unmapped original fields preserved for debugging
   * }
   */
  @Column({ type: 'jsonb', nullable: true, default: {} })
  @Index('idx_measurements_metadata_gin', { synchronize: false })
  // GIN index created via raw SQL: CREATE INDEX idx_measurements_metadata_gin ON measurements USING GIN (metadata);
  metadata: Record<string, unknown>;

  /**
   * Record creation timestamp for auditing.
   * Automatically set by TypeORM on insert.
   */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
