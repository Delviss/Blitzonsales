import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { MonthClose } from '../entities/month-close.entity';
import { ClawbackReceivable } from '../entities/clawback-receivable.entity';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { PostingObjectsModule } from '../posting-objects/posting-objects.module';
import { WarningsModule } from '../warnings/warnings.module';
import { ForecastModule } from '../forecast/forecast.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { FounderDashboardService } from './founder-dashboard.service';
import { FounderDashboardController } from './founder-dashboard.controller';

/**
 * Founder dashboard & reporting module (Epic P6 · I-27…I-30, Fachkonzept ch. 11,
 * plus the ch. 18 acceptance checklist & KPI export from I-37). Composes the
 * shared run computation (CommissionsModule), the posting objects, the warning
 * system, the forecast and the data-quality view so every KPI matches the
 * eventual booking exactly.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, SalesRep, Organisation, MonthClose, ClawbackReceivable]),
    ConfigStoreModule,
    CommissionsModule,
    PostingObjectsModule,
    WarningsModule,
    ForecastModule,
    IngestionModule,
  ],
  providers: [FounderDashboardService],
  controllers: [FounderDashboardController],
  exports: [FounderDashboardService],
})
export class FounderDashboardModule {}
