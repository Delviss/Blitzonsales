import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppUser } from '../entities/app-user.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Contract } from '../entities/contract.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { DatenschutzService } from './datenschutz.service';
import { DatenschutzController } from './datenschutz.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([AppUser, SalesRep, Contract, CommissionLine]), AuditModule],
  providers: [DatenschutzService],
  controllers: [DatenschutzController],
})
export class DatenschutzModule {}
