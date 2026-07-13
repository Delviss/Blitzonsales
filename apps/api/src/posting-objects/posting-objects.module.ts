import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommercialReserve } from '../entities/commercial-reserve.entity';
import { ClawbackReceivable } from '../entities/clawback-receivable.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { AuditModule } from '../audit/audit.module';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { CommercialReserveService } from './commercial-reserve.service';
import { CommercialReserveController } from './commercial-reserve.controller';
import { StornoAccountService } from './storno-account.service';
import { StornoAccountController } from './storno-account.controller';
import { ClawbackService } from './clawback.service';
import { ClawbackController } from './clawback.controller';

/**
 * Wave 2 posting objects (I-23 storno accounts, I-24 commercial reserve, I-25
 * clawback receivables). The commission run's freigabe persists reserves and
 * storno withholdings here; the clawback service offsets against the storno
 * accounts. All three surfaces feed the Founder dashboard.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CommercialReserve, ClawbackReceivable, SalesRep, CommissionLine]),
    AuditModule,
    ConfigStoreModule,
  ],
  providers: [CommercialReserveService, StornoAccountService, ClawbackService],
  controllers: [CommercialReserveController, StornoAccountController, ClawbackController],
  exports: [CommercialReserveService, StornoAccountService, ClawbackService],
})
export class PostingObjectsModule {}
