import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionArchive } from '../entities/ingestion-archive.entity';
import { IngestionError } from '../entities/ingestion-error.entity';
import { SyncRun } from '../entities/sync-run.entity';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Produkt } from '../entities/produkt.entity';
import { Organisation } from '../entities/organisation.entity';
import { ContractStatusEvent } from '../entities/contract-status-event.entity';
import { FinancialEvent } from '../entities/financial-event.entity';
import { ConfigVersion } from '../entities/config-version.entity';
import { StatusMaster } from '../entities/status-master.entity';
import { LedgerService } from '../config-store/ledger.service';
import { BusinessConfigService } from '../config-store/business-config.service';
import { StatusMasterService } from '../status-master/status-master.service';
import { IngestionArchiveService } from './ingestion-archive.service';
import { IngestionErrorService } from './ingestion-error.service';
import { ContractUpsertService } from './contract-upsert.service';
import { DataQualityService } from './data-quality.service';
import { IngestionController } from './ingestion.controller';

/**
 * Shared ingestion backbone for Wave 3 (I-10 archive, I-11 upsert + error list +
 * data quality). Both the file import (I-12) and the Joules sync (I-09) depend on
 * these services so the two channels archive, upsert and validate identically.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IngestionArchive,
      IngestionError,
      SyncRun,
      Contract,
      SalesRep,
      Produkt,
      Organisation,
      ContractStatusEvent,
      FinancialEvent,
      ConfigVersion,
      StatusMaster,
    ]),
  ],
  providers: [
    IngestionArchiveService,
    IngestionErrorService,
    ContractUpsertService,
    DataQualityService,
    LedgerService,
    BusinessConfigService,
    StatusMasterService,
  ],
  controllers: [IngestionController],
  exports: [IngestionArchiveService, IngestionErrorService, ContractUpsertService, DataQualityService, LedgerService],
})
export class IngestionModule {}
