import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { StornoAccountService } from './storno-account.service';

/**
 * Employee storno accounts (I-23). Founder/Backoffice/read-only may view the
 * ch. 10.1 breakdown per employee and the grand total; Founder/Backoffice may
 * manually release part of an account (I-26) — storno credit is never auto-paid.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('storno-konten')
export class StornoAccountController {
  constructor(private readonly svc: StornoAccountService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  list(@Query('repId') repId?: string) {
    return this.svc.summary(repId);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('total')
  total() {
    return this.svc.total();
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post(':repId/freigeben')
  release(
    @Param('repId') repId: string,
    @Body() body: { betrag: number; datum?: string; genehmigtVon?: string; grund?: string; begruendung?: string },
    @Request() req: any,
  ) {
    return this.svc.release(
      repId,
      { betrag: body.betrag, datum: body.datum, genehmigtVon: body.genehmigtVon, grund: body.grund ?? body.begruendung },
      req.user.sub,
    );
  }
}
