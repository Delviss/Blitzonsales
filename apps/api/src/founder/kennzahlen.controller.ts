import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { KennzahlenService } from './kennzahlen.service';

/**
 * Founder dashboard KPI tiles (I-27, Fachkonzept ch. 11.1), all net (I-29),
 * incl. free operating liquidity and the live real-time projection (I-30).
 * `GET /api/kennzahlen` returns the tiles; `GET /api/kennzahlen/export` the CSV
 * snapshot (I-37). Founder/Backoffice/read-only.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('kennzahlen')
export class KennzahlenController {
  constructor(private readonly svc: KennzahlenService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  kennzahlen(@Query('periode') periode?: string) {
    return this.svc.kennzahlen(periode);
  }

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('export')
  async export(@Query('periode') periode: string | undefined, @Res() res: Response) {
    const { filename, buffer, contentType } = await this.svc.exportCsv(periode);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }
}
