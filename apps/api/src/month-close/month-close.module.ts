import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MonthClose } from '../entities/month-close.entity';
import { AuditModule } from '../audit/audit.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { MonthCloseService } from './month-close.service';
import { MonthCloseController } from './month-close.controller';

/**
 * Month-end close & freeze (I-34, Epic P8). Depends on CommissionsModule for the
 * run computation reused to snapshot a month, and exports MonthCloseService so
 * the run can consult the closed-month state for immutability + addenda (I-17).
 */
@Module({
  imports: [TypeOrmModule.forFeature([MonthClose]), AuditModule, CommissionsModule],
  providers: [MonthCloseService],
  controllers: [MonthCloseController],
  exports: [MonthCloseService],
})
export class MonthCloseModule {}
