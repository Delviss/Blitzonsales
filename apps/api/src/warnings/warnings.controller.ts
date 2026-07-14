import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { WarningsService } from './warnings.service';

/**
 * Warning & check system (I-35, Fachkonzept ch. 13). `GET /api/warnungen`
 * returns the ranked red/yellow/info checks for the running (or a given) month
 * with per-level counts for the Founder dashboard. Founder/Backoffice/read-only.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('warnungen')
export class WarningsController {
  constructor(private readonly svc: WarningsService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  warnungen(@Query('periode') periode?: string) {
    return this.svc.warnings(periode);
  }
}
