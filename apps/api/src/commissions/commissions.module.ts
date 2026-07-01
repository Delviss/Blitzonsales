import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionRule } from '../entities/commission-rule.entity';
import { CommissionRun } from '../entities/commission-run.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { Contract } from '../entities/contract.entity';
import { CommissionRulesService } from './commission-rules.service';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRunsService } from './commission-runs.service';
import { CommissionRunsController } from './commission-runs.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([CommissionRule, CommissionRun, CommissionLine, Contract]), AuditModule],
  providers: [CommissionRulesService, CommissionRunsService],
  controllers: [CommissionRulesController, CommissionRunsController],
  exports: [CommissionRulesService, CommissionRunsService],
})
export class CommissionsModule {}
