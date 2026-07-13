import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommissionRule } from '../entities/commission-rule.entity';
import { CommissionRun } from '../entities/commission-run.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { CommissionRulesService } from './commission-rules.service';
import { CommissionRulesController } from './commission-rules.controller';
import { CommissionRunsService } from './commission-runs.service';
import { CommissionRunsController } from './commission-runs.controller';
import { FachkonzeptRunService } from './fachkonzept/fachkonzept-run.service';
import { FachkonzeptRunController } from './fachkonzept/fachkonzept-run.controller';
import { AuditModule } from '../audit/audit.module';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { StatusMasterModule } from '../status-master/status-master.module';
import { PostingObjectsModule } from '../posting-objects/posting-objects.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommissionRule, CommissionRun, CommissionLine, Contract, SalesRep]),
    AuditModule,
    ConfigStoreModule,
    StatusMasterModule,
    PostingObjectsModule,
  ],
  providers: [CommissionRulesService, CommissionRunsService, FachkonzeptRunService],
  controllers: [CommissionRulesController, CommissionRunsController, FachkonzeptRunController],
  exports: [CommissionRulesService, CommissionRunsService, FachkonzeptRunService],
})
export class CommissionsModule {}
