import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organisation } from './organisation.entity';
import { OrganisationenService } from './organisationen.service';
import { OrganisationenController } from './organisationen.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([Organisation]), AuditModule],
  providers: [OrganisationenService],
  controllers: [OrganisationenController],
  exports: [OrganisationenService],
})
export class OrganisationenModule {}
