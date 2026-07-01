import { Controller, ForbiddenException, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { Rolle } from '@blitzon/shared';
import { DatenschutzService } from './datenschutz.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('datenschutz')
export class DatenschutzController {
  constructor(private readonly svc: DatenschutzService) {}

  /** Any user may export their own data; only Admin/GF may export on behalf of someone else. */
  @Get('export/:userId')
  export(@Param('userId') userId: string, @Request() req: any) {
    if (req.user.sub !== userId && req.user.rolle !== Rolle.AdminGf) {
      throw new ForbiddenException('Zugriff verweigert.');
    }
    return this.svc.exportPersonalData(userId);
  }

  @Roles(Rolle.AdminGf)
  @Post('loeschantrag/:userId')
  erasure(@Param('userId') userId: string, @Request() req: any) {
    return this.svc.requestErasure(userId, req.user.sub);
  }
}
