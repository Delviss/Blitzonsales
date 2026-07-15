import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { FounderDashboardService } from './founder-dashboard.service';

/**
 * Founder dashboard & reporting (Epic P6, Fachkonzept ch. 11 + ch. 18).
 *
 * `GET /api/founder-dashboard` returns the ch. 11.1 KPI tiles net throughout
 * (I-27/I-29) with the live forecast section attached (I-30). The `/drilldown/*`
 * routes expose the month/rep/organisation/contract/reserve drill-downs, every
 * one traceable to a single SWA order number (I-28). `/akzeptanzkriterien`
 * evaluates the 11 ch. 18 criteria and `/export` emits the KPI CSV (I-37). All
 * surfaces are Founder/Backoffice/read-only.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('founder-dashboard')
export class FounderDashboardController {
  constructor(private readonly svc: FounderDashboardService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  dashboard(@Query('periode') periode?: string) {
    return this.svc.dashboard(periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('drilldown/monat')
  drilldownMonth(@Query('periode') periode?: string) {
    return this.svc.drilldownMonth(periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('drilldown/verkaeufer/:repId')
  drilldownRep(@Param('repId') repId: string, @Query('periode') periode?: string) {
    return this.svc.drilldownRep(repId, periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('drilldown/organisation/:orgId')
  drilldownOrg(@Param('orgId') orgId: string, @Query('periode') periode?: string) {
    return this.svc.drilldownOrg(orgId, periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('drilldown/vertrag/:contractId')
  drilldownContract(@Param('contractId') contractId: string) {
    return this.svc.drilldownContract(contractId);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('drilldown/ruecklagen')
  drilldownReserves() {
    return this.svc.drilldownReserves();
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('akzeptanzkriterien')
  acceptanceCriteria(@Query('periode') periode?: string) {
    return this.svc.acceptanceCriteria(periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('export')
  async exportKpi(@Query('periode') periode: string | undefined, @Res() res: Response) {
    const { filename, buffer, contentType } = await this.svc.exportKpiCsv(periode);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }
}
