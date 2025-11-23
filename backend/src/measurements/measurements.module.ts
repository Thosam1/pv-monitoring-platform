import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Measurement } from '../database/entities/measurement.entity';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';

/**
 * MeasurementsModule
 *
 * Provides read endpoints for measurement data.
 * Used by the frontend for chart visualization.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Measurement])],
  controllers: [MeasurementsController],
  providers: [MeasurementsService],
  exports: [MeasurementsService],
})
export class MeasurementsModule {}
