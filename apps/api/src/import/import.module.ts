import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImportBatch } from '../entities/import-batch.entity';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Produkt } from '../entities/produkt.entity';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([ImportBatch, Contract, SalesRep, Produkt]), AuditModule],
  providers: [ImportService],
  controllers: [ImportController],
  exports: [ImportService],
})
export class ImportModule {}
