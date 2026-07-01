import { Controller, Get, NotFoundException, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('vertraege')
export class ContractsController {
  constructor(private readonly svc: ContractsService) {}

  @Get()
  findAll(@Query('repId') repId: string | undefined, @Request() req: any) {
    return this.svc.findAll(req.user, repId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    const contract = await this.svc.findOne(id, req.user);
    if (!contract) throw new NotFoundException();
    return contract;
  }
}
