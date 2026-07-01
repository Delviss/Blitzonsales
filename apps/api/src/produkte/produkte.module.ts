import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Produkt } from '../entities/produkt.entity';
import { ProdukteService } from './produkte.service';
import { ProdukteController } from './produkte.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Produkt]), AuditModule],
  providers: [ProdukteService],
  controllers: [ProdukteController],
  exports: [ProdukteService],
})
export class ProdukteModule {}
