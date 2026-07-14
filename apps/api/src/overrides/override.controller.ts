import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { OverrideService, OverrideInput } from './override.service';

/**
 * Manual override endpoints (I-36, Fachkonzept ch. 12.2 / 12.1).
 *
 * `POST /api/commission/:id/override` records a Founder/Backoffice-only manual
 * correction of a contract's SWA commission with a mandatory reason (audited,
 * ledgered). `GET /api/commission/:id/override` shows the original SWA value —
 * always visible — next to the effective (overridden) value and the full trail.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('commission')
export class OverrideController {
  constructor(private readonly svc: OverrideService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get(':id/override')
  view(@Param('id') id: string) {
    return this.svc.view(id);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post(':id/override')
  override(@Param('id') id: string, @Body() body: OverrideInput, @Request() req: any) {
    return this.svc.overrideContractSwa(id, body, req.user.sub);
  }
}
