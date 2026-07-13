import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigVersion } from '../entities/config-version.entity';
import { ContractStatusEvent } from '../entities/contract-status-event.entity';
import { FinancialEvent } from '../entities/financial-event.entity';
import { AuditModule } from '../audit/audit.module';
import { BusinessConfigService } from './business-config.service';
import { LedgerService } from './ledger.service';
import { ConfigStoreController } from './config-store.controller';

/**
 * Epic P0 foundation module: versioned business config (I-01) and the
 * append-only status / financial event ledger (I-03). Both services are
 * exported so the engines and import/sync paths can resolve config as-of a date
 * and write ledger entries.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ConfigVersion, ContractStatusEvent, FinancialEvent]), AuditModule],
  providers: [BusinessConfigService, LedgerService],
  controllers: [ConfigStoreController],
  exports: [BusinessConfigService, LedgerService],
})
export class ConfigStoreModule {}
