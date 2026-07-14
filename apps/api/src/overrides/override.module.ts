import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { ManualOverride } from '../entities/manual-override.entity';
import { AuditModule } from '../audit/audit.module';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { OverrideService } from './override.service';
import { OverrideController } from './override.controller';

/**
 * Manual overrides + audit trail (I-36, Epic P8). Uses the append-only ledger
 * (ConfigStoreModule) for the correction entry and the audit log for the trail.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Contract, ManualOverride]), AuditModule, ConfigStoreModule],
  providers: [OverrideService],
  controllers: [OverrideController],
  exports: [OverrideService],
})
export class OverrideModule {}
