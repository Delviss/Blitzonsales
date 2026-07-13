import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { FachkonzeptRunService } from './fachkonzept-run.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN, Rolle } from '@blitzon/shared';

/**
 * Fachkonzept Provisionslauf endpoints. Kept on a dedicated `/fachkonzept`
 * sub-path so the legacy rule-engine run endpoints stay untouched.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('provisionslaeufe/fachkonzept')
export class FachkonzeptRunController {
  constructor(private readonly svc: FachkonzeptRunService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  findAll(@Query('organisationId') organisationId?: string) {
    return this.svc.findAll(organisationId);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post()
  create(@Body() body: { periode: string; organisationId?: string }, @Request() req: any) {
    return this.svc.create(body, req.user.sub);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post(':id/generate')
  generate(@Param('id') id: string, @Request() req: any) {
    return this.svc.generate(id, req.user.sub);
  }

  @Roles(Rolle.AdminGf)
  @Post(':id/freigeben')
  freigeben(@Param('id') id: string, @Request() req: any) {
    return this.svc.freigeben(id, req.user.sub);
  }
}
