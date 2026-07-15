import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contract } from '../entities/contract.entity';
import { FounderModule } from '../founder/founder.module';
import { AkzeptanzService } from './akzeptanz.service';
import { AkzeptanzController } from './akzeptanz.controller';

/**
 * Phase-1 release gate (I-37, Epic P8, Fachkonzept ch. 18). Depends on the
 * Founder KPI service for the live free-liquidity signal.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Contract]), FounderModule],
  providers: [AkzeptanzService],
  controllers: [AkzeptanzController],
})
export class AkzeptanzModule {}
