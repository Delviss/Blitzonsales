import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { ForecastService } from './forecast.service';

/**
 * Live forecast / preview (I-16). `GET /api/forecast?periode=JJJJ-MM` returns a
 * provisional projection for the running (or a given) month; defaults to the
 * current month. Founder/Backoffice/read-only may view it.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('forecast')
export class ForecastController {
  constructor(private readonly svc: ForecastService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get()
  forecast(@Query('periode') periode?: string, @Query('organisationId') organisationId?: string) {
    return this.svc.forecast(periode, organisationId);
  }
}
