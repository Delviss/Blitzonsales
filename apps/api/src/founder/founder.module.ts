import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { FinancialEvent } from '../entities/financial-event.entity';
import { Wiedervorlage } from '../entities/wiedervorlage.entity';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { PostingObjectsModule } from '../posting-objects/posting-objects.module';
import { WarningsModule } from '../warnings/warnings.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { ForecastModule } from '../forecast/forecast.module';
import { KennzahlenService } from './kennzahlen.service';
import { KennzahlenController } from './kennzahlen.controller';
import { DrilldownService } from './drilldown.service';
import { DrilldownController } from './drilldown.controller';

/**
 * Founder dashboard surfacing layer (Epic P6): KPI tiles incl. free operating
 * liquidity (I-27), drill-downs to the SWA order number (I-28) and the real-time
 * projection surfaced on top (I-30). Reuses the run computation, the versioned
 * config, the posting objects, the warnings and the data-quality view so nothing
 * is recomputed differently from the eventual booking.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, SalesRep, Organisation, CommissionLine, FinancialEvent, Wiedervorlage]),
    ConfigStoreModule,
    CommissionsModule,
    PostingObjectsModule,
    WarningsModule,
    IngestionModule,
    ForecastModule,
  ],
  providers: [KennzahlenService, DrilldownService],
  controllers: [KennzahlenController, DrilldownController],
  exports: [KennzahlenService],
})
export class FounderModule {}
