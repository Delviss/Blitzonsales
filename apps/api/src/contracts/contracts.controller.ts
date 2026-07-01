import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('vertraege')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  @Get()
  findAll(@Query('repId') repId?: string) { return this.svc.findAll(repId); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOne(id); }
}
