import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { CommercialReserve } from '../entities/commercial-reserve.entity';
import { ConfigStoreModule } from '../config-store/config-store.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { WarningsService } from './warnings.service';
import { WarningsController } from './warnings.controller';

/**
 * Warning & check system (I-35, Epic P8, ch. 13). Reuses the run computation
 * (CommissionsModule) and the versioned config (ConfigStoreModule); reads the
 * persisted commercial reserves for the under-funding check.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Contract, SalesRep, Organisation, CommercialReserve]),
    ConfigStoreModule,
    CommissionsModule,
  ],
  providers: [WarningsService],
  controllers: [WarningsController],
  exports: [WarningsService],
})
export class WarningsModule {}
