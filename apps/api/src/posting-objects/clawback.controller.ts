import { Body, Controller, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { CollectionsStatus, PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { ClawbackService, CreateClawbackInput } from './clawback.service';

/**
 * Clawback receivables (I-25). Founder/Backoffice may create a receivable from
 * an SWA clawback (which offsets in the fixed order and draws the storno-account
 * portion out of the account) and record invoice/payment/collections; read-only
 * may view.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clawbacks')
export class ClawbackController {
  constructor(private readonly svc: ClawbackService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post()
  create(@Body() body: CreateClawbackInput, @Request() req: any) {
    return this.svc.create(body, req.user.sub);
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { rechnungRef?: string; zahlung?: number; inkassoStatus?: CollectionsStatus },
    @Request() req: any,
  ) {
    return this.svc.update(id, body, req.user.sub);
  }
}
