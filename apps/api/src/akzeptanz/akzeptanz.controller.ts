import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { AkzeptanzService } from './akzeptanz.service';

/**
 * Phase-1 release gate (I-37, Fachkonzept ch. 18). `GET /api/akzeptanz` returns
 * the 11-criteria checklist with live pass/fail state. Founder/Backoffice/read-only.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('akzeptanz')
export class AkzeptanzController {
  constructor(private readonly svc: AkzeptanzService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  pruefen(@Query('periode') periode?: string) {
    return this.svc.pruefen(periode);
  }
}
