import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { ForecastService } from './forecast.service';
import { ForecastController } from './forecast.controller';

/**
 * Live forecast / preview module (I-16, Fachkonzept ch. 11.3). Depends on the
 * commission module for the shared run computation (`FachkonzeptRunService`) so
 * the provisional projection matches the eventual booking exactly.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Contract]), ConfigStoreModule, CommissionsModule],
  providers: [ForecastService],
  controllers: [ForecastController],
  exports: [ForecastService],
})
export class ForecastModule {}
