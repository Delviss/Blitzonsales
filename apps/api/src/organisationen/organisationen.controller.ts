import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Request } from '@nestjs/common';
import { OrganisationenService } from './organisationen.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('organisationen')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrganisationenController {
  constructor(private readonly service: OrganisationenService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin_gf')
  create(@Body() body: { name: string; parent_id?: string; typ: string }, @Request() req: { user: { id: string } }) {
    return this.service.create(body, req.user.id);
  }

  @Put(':id')
  @Roles('admin_gf')
  update(@Param('id') id: string, @Body() body: { name?: string; typ?: string }, @Request() req: { user: { id: string } }) {
    return this.service.update(id, body, req.user.id);
  }

  @Delete(':id')
  @Roles('admin_gf')
  remove(@Param('id') id: string, @Request() req: { user: { id: string } }) {
    return this.service.remove(id, req.user.id);
  }
}
