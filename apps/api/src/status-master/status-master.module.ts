import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatusMaster } from '../entities/status-master.entity';
import { AuditModule } from '../audit/audit.module';
import { StatusMasterService } from './status-master.service';
import { StatusMasterController } from './status-master.controller';

/**
 * Status master data (I-06). Exported so the commission engines can resolve the
 * qualifying-status set as-of a reference date.
 */
@Module({
  imports: [TypeOrmModule.forFeature([StatusMaster]), AuditModule],
  providers: [StatusMasterService],
  controllers: [StatusMasterController],
  exports: [StatusMasterService],
})
export class StatusMasterModule {}
