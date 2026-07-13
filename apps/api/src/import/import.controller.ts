import { BadRequestException, Controller, Get, Post, Request, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { PHASE1_OPERATIONS_ROLLEN, PHASE1_READ_ROLLEN } from '@blitzon/shared';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('import')
export class ImportController {
  constructor(private readonly svc: ImportService) {}

  @Roles(...PHASE1_READ_ROLLEN)
  @Get('batches')
  findBatches() {
    return this.svc.findBatches();
  }

  @Roles(...PHASE1_OPERATIONS_ROLLEN)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async upload(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
    if (!file) throw new BadRequestException('Keine Datei hochgeladen.');
    return this.svc.importFile(file.buffer, file.originalname, req.user.sub);
  }
}
