import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JoulesSyncService } from './joules-sync.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sync')
export class JoulesSyncController {
  constructor(private readonly svc: JoulesSyncService) {}

  /** On-demand delta sync (I-09). Founder / Backoffice only. */
  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post('joules')
  run(@Body() body: { statuses?: string[] } | undefined, @Request() req: any) {
    return this.svc.runSync({ akteur: req.user.sub, ausloeser: 'manual', statuses: body?.statuses });
  }

  /** Recent sync runs (I-09) — last-sync surface for the data-quality view. */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('runs')
  runs() {
    return this.svc.findRuns();
  }

  /** Whether a Joules credential is configured (I-08 is externally blocked). */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('status')
  status() {
    return { konfiguriert: this.svc.configured() };
  }
}
