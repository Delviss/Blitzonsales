import { Controller, Get, Post, Put, Param, Body, UseGuards, Request } from '@nestjs/common';
import { SalesRepsService } from './sales-reps.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { Rolle } from '@blitzon/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('verkaeufer')
export class SalesRepsController {
  constructor(private readonly svc: SalesRepsService) {}

  @Get()
  findAll() { return this.svc.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOne(id); }

  @Roles(Rolle.AdminGf)
  @Post()
  create(@Body() body: any, @Request() req: any) { return this.svc.create(body, req.user.sub); }

  @Roles(Rolle.AdminGf)
  @Put(':id')
  update(@Param('id') id: string, @Body() body: any, @Request() req: any) {
    return this.svc.update(id, body, req.user.sub);
  }
}
