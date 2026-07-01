import { Body, Controller, Get, Param, Post, Query, Res, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { CommissionRunsService } from './commission-runs.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Rolle } from '@blitzon/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('provisionslaeufe')
export class CommissionRunsController {
  constructor(private readonly svc: CommissionRunsService) {}

  @Roles(Rolle.AdminGf, Rolle.Teamleiter, Rolle.Backoffice)
  @Get()
  findAll(@Query('organisationId') organisationId?: string) {
    return this.svc.findAll(organisationId);
  }

  @Roles(Rolle.AdminGf, Rolle.Teamleiter, Rolle.Backoffice)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Roles(Rolle.AdminGf, Rolle.Teamleiter)
  @Post()
  create(@Body() body: { periode: string; organisationId?: string }, @Request() req: any) {
    return this.svc.create(body, req.user.sub);
  }

  @Roles(Rolle.AdminGf, Rolle.Teamleiter, Rolle.Backoffice)
  @Post(':id/generate')
  generate(@Param('id') id: string, @Request() req: any) {
    return this.svc.generate(id, req.user.sub);
  }

  @Roles(Rolle.AdminGf)
  @Post(':id/freigeben')
  freigeben(@Param('id') id: string, @Request() req: any) {
    return this.svc.freigeben(id, req.user.sub);
  }

  @Roles(Rolle.AdminGf, Rolle.Backoffice)
  @Get(':id/export/buchhaltung')
  async exportBuchhaltung(@Param('id') id: string, @Query('format') format: string | undefined, @Request() req: any, @Res() res: Response) {
    const { filename, buffer, contentType } = await this.svc.exportBuchhaltung(id, format ?? 'csv', req.user.sub);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  // Kept for backward compatibility with the original placeholder route name.
  @Roles(Rolle.AdminGf, Rolle.Backoffice)
  @Get(':id/export/datev')
  async exportDatev(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const { filename, buffer, contentType } = await this.svc.exportBuchhaltung(id, 'datev', req.user.sub);
    res.set({ 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }

  @Roles(Rolle.AdminGf, Rolle.Backoffice)
  @Get(':id/export/intern')
  async exportIntern(@Param('id') id: string, @Request() req: any, @Res() res: Response) {
    const { filename, buffer } = await this.svc.exportIntern(id, req.user.sub);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.send(buffer);
  }

  @Get(':id/export/abrechnung/:repId')
  async exportAbrechnung(@Param('id') id: string, @Param('repId') repId: string, @Request() req: any, @Res() res: Response) {
    const { filename, buffer } = await this.svc.exportAbrechnungPdf(id, repId, req.user);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    res.send(buffer);
  }
}
