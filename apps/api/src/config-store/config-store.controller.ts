import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { Rolle } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { BusinessConfigService } from './business-config.service';
import { AuditService } from '../audit/audit.service';

/**
 * Versioned business-config surface (I-01). Founder/Backoffice may read the
 * resolved config as-of a date; only Founder/Admin may create a new version.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('config')
export class ConfigStoreController {
  constructor(
    private readonly svc: BusinessConfigService,
    private readonly audit: AuditService,
  ) {}

  @Roles(Rolle.AdminGf, Rolle.Backoffice)
  @Get()
  resolveAll(@Query('asOf') asOf?: string) {
    return this.svc.resolveAll(asOf ?? new Date().toISOString().slice(0, 10));
  }

  @Roles(Rolle.AdminGf)
  @Post()
  async setValue(
    @Body() body: { schluessel: string; wert: unknown; gueltigAb: string },
    @Request() req: any,
  ) {
    const row = await this.svc.setValue(body.schluessel, body.wert, body.gueltigAb, req.user.sub);
    await this.audit.log({
      entity: 'config_version',
      entityId: row.id,
      aktion: 'create',
      neu: { schluessel: body.schluessel, wert: body.wert, gueltigAb: body.gueltigAb },
      userId: req.user.sub,
    });
    return row;
  }

  @Roles(Rolle.AdminGf)
  @Post('seed')
  async seed(@Request() req: any) {
    const inserted = await this.svc.seedDefaults();
    await this.audit.log({ entity: 'config_version', entityId: null, aktion: 'seed', neu: { inserted }, userId: req.user.sub });
    return { inserted };
  }
}
