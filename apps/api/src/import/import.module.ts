import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportBatch } from '../entities/import-batch.entity';
import { Contract } from '../entities/contract.entity';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { AuditModule } from '../audit/audit.module';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImportBatch, Contract]), AuditModule, IngestionModule],
  providers: [ImportService],
  controllers: [ImportController],
  exports: [ImportService],
})
export class ImportModule {}
