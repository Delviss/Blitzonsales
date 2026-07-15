import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { DrilldownService } from './drilldown.service';

const currentPeriode = () => new Date().toISOString().slice(0, 7);

/**
 * Drill-downs from any Founder figure down to the individual SWA order number
 * (I-28, Fachkonzept ch. 11.2 / 18). Founder/Backoffice/read-only.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('drilldown')
export class DrilldownController {
  constructor(private readonly svc: DrilldownService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('monat/:periode')
  monat(@Param('periode') periode: string) {
    return this.svc.monat(periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('rep/:repId')
  rep(@Param('repId') repId: string, @Query('periode') periode?: string) {
    return this.svc.rep(repId, periode || currentPeriode());
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('organisation/:orgId')
  organisation(@Param('orgId') orgId: string, @Query('periode') periode?: string) {
    return this.svc.organisation(orgId, periode || currentPeriode());
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('vertrag/:contractId')
  vertrag(@Param('contractId') contractId: string) {
    return this.svc.vertrag(contractId);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('ruecklagen')
  ruecklagen() {
    return this.svc.ruecklagen();
  }
}
