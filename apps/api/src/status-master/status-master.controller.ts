import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { PHASE1_READ_ROLLEN, Rolle } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { StatusMasterService } from './status-master.service';
import { AuditService } from '../audit/audit.service';

/**
 * Status master surface (I-06). Founder/Backoffice/read-only may read the
 * resolved master as-of a date; only Founder/Admin may release a new version.
 * The tier engines read the qualifying set from this master, never from a
 * hardcoded list.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('status-master')
export class StatusMasterController {
  constructor(
    private readonly svc: StatusMasterService,
    private readonly audit: AuditService,
  ) {}

  /** Resolved master as-of a date (default today), or all versions with ?all=1. */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  list(@Query('asOf') asOf?: string, @Query('all') all?: string) {
    if (all === '1' || all === 'true') return this.svc.findAll();
    return this.svc.resolveAsOf(asOf ?? new Date().toISOString().slice(0, 10));
  }

  /** The qualifying status codes as-of a date (I-06 safety rule). */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('qualifying')
  qualifying(@Query('asOf') asOf?: string) {
    return this.svc.qualifyingCodes(asOf ?? new Date().toISOString().slice(0, 10));
  }

  @Roles(Rolle.AdminGf)
  @Post()
  async setEntry(
    @Body() body: { code: string; bezeichnung: string; qualifiziert: boolean; kategorie?: string | null; gueltigAb: string },
    @Request() req: any,
  ) {
    const row = await this.svc.setEntry({ ...body, quelle: 'admin' }, req.user.sub);
    await this.audit.log({
      entity: 'status_master',
      entityId: row.id,
      aktion: 'create',
      neu: { code: body.code, qualifiziert: body.qualifiziert, gueltigAb: body.gueltigAb },
      userId: req.user.sub,
    });
    return row;
  }

  @Roles(Rolle.AdminGf)
  @Post('seed')
  async seed(@Request() req: any) {
    const inserted = await this.svc.seedDefaults();
    await this.audit.log({ entity: 'status_master', entityId: null, aktion: 'seed', neu: { inserted }, userId: req.user.sub });
    return { inserted };
  }
}
