import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { IntakeInput, WiedervorlageService } from './wiedervorlage.service';

/**
 * Contract-intake lead-time check (I-31) and follow-ups (I-32).
 *
 *   • POST /api/intake/pruefen — evaluate an intake against the lead-time rule;
 *     on a breach it returns the exact rejection reason and creates a follow-up.
 *   • GET  /api/wiedervorlagen — the follow-up list.
 *   • POST /api/wiedervorlagen/prozess-faellige — dispatch due follow-up emails.
 *   • POST /api/wiedervorlagen/:id/erledigt — mark a follow-up done.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WiedervorlageController {
  constructor(private readonly svc: WiedervorlageService) {}

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post('intake/pruefen')
  evaluate(@Body() body: IntakeInput, @Request() req: any) {
    return this.svc.evaluateIntake(body, req.user.sub);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('wiedervorlagen')
  list(@Query('status') status?: string) {
    return this.svc.findAll(status);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post('wiedervorlagen/prozess-faellige')
  processDue(@Body() body: { stichtag?: string }, @Request() req: any) {
    const asOf = body?.stichtag || new Date().toISOString().slice(0, 10);
    return this.svc.processDue(asOf, req.user.sub);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post('wiedervorlagen/:id/erledigt')
  resolve(@Param('id') id: string, @Request() req: any) {
    return this.svc.resolve(id, req.user.sub);
  }
}
