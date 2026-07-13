import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Request } from '@nestjs/common';
import { CommissionRulesService } from './commission-rules.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { PHASE1_READ_ROLLEN, Rolle } from '@blitzon/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('provisionsregeln')
export class CommissionRulesController {
  constructor(private readonly svc: CommissionRulesService) {}

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

  @Roles(Rolle.AdminGf)
  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.svc.create(body, req.user.sub);
  }

  @Roles(Rolle.AdminGf)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.sub);
  }

  @Roles(Rolle.AdminGf)
  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.svc.remove(id, req.user.sub);
  }
}
