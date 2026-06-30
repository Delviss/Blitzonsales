import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesRep } from '../entities/sales-rep.entity';
import { SalesRepsService } from './sales-reps.service';
import { SalesRepsController } from './sales-reps.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([SalesRep]), AuditModule],
  providers: [SalesRepsService],
  controllers: [SalesRepsController],
  exports: [SalesRepsService],
})
export class SalesRepsModule {}
