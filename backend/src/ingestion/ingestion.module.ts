import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Measurement } from '../database/entities/measurement.entity';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { GoodWeParser } from './strategies/goodwe.strategy';
import { LtiParser } from './strategies/lti.strategy';
import { IntegraParser } from './strategies/integra.strategy';
import { MbmetParser } from './strategies/mbmet.strategy';

/**
 * IngestionModule
 *
 * Provides file parsing and data ingestion capabilities for the platform.
 *
 * Components:
 * - IngestionController: REST API for file uploads
 * - IngestionService: Orchestrates parsing and database insertion
 * - GoodWeParser: Strategy for GoodWe/SEMS CSV files
 * - LtiParser: Strategy for LTI ReEnergy sectioned CSV files
 * - IntegraParser: Strategy for Integra Sun/Meteocontrol XML files
 * - MbmetParser: Strategy for MBMET 501FB Meteo Station CSV files
 *
 * Future Expansion:
 * - Add SMAParser for SMA Sunny Portal exports
 * - Add FroniusParser for Fronius DataManager exports
 * - Add GenericCSVParser as fallback for unknown formats
 */
@Module({
  imports: [TypeOrmModule.forFeature([Measurement])],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    GoodWeParser,
    LtiParser,
    IntegraParser,
    MbmetParser,
  ],
  exports: [IngestionService],
})
export class IngestionModule {}
