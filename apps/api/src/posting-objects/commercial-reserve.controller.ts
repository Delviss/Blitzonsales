import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PHASE1_READ_ROLLEN, Rolle } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { CommercialReserveService } from './commercial-reserve.service';

/**
 * Commercial reserve posting objects (I-24). Founder/Backoffice/read-only may
 * view the per-contract reserves and the roll-up (with the under-funding flag);
 * only Founder may correct the funded amount or release a reserve.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gewerbe-ruecklagen')
export class CommercialReserveController {
  constructor(private readonly svc: CommercialReserveService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  findAll(@Query('runId') runId?: string) {
    return runId ? this.svc.findByRun(runId) : this.svc.findAll();
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('summary')
  summary() {
    return this.svc.summary();
  }

  @Roles(Rolle.AdminGf)
  @Post(':id/ist')
  setActual(@Param('id') id: string, @Body() body: { reserveActual: number }, @Request() req: any) {
    return this.svc.setActual(id, body.reserveActual, req.user.sub);
  }

  @Roles(Rolle.AdminGf)
  @Post(':id/freigeben')
  release(@Param('id') id: string, @Request() req: any) {
    return this.svc.release(id, req.user.sub);
  }
}
