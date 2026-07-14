import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN, Rolle } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { MonthCloseService } from './month-close.service';

/**
 * Month-end close & freeze endpoints (I-34, Fachkonzept ch. 12.3 / 5.2).
 *
 * Founder/Backoffice may view the close state and close a month; only
 * Founder/Admin may reopen a closed month, and every close/reopen is audited by
 * the service.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monatsabschluss')
export class MonthCloseController {
  constructor(private readonly svc: MonthCloseService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  list() {
    return this.svc.list();
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get(':periode')
  status(@Param('periode') periode: string) {
    return this.svc.status(periode);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post()
  close(@Body() body: { periode: string }, @Request() req: any) {
    return this.svc.close(body?.periode, req.user.sub);
  }

  @Roles(Rolle.AdminGf)
  @Post(':periode/reopen')
  reopen(@Param('periode') periode: string, @Body() body: { grund: string }, @Request() req: any) {
    return this.svc.reopen(periode, body?.grund, req.user.sub);
  }
}
