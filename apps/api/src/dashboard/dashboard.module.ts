import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { Produkt } from '../entities/produkt.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Contract, CommissionLine, SalesRep, Organisation, Produkt])],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}
