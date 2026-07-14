import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { PHASE1_READ_ROLLEN } from '@blitzon/shared';
import { IngestionArchiveService } from './ingestion-archive.service';
import { IngestionErrorService } from './ingestion-error.service';
import { DataQualityService } from './data-quality.service';

/**
 * Read surfaces for the ingestion archive (I-10) and the data-quality view
 * (I-11). All read-only, open to Founder / Backoffice / read-only.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class IngestionController {
  constructor(
    private readonly archive: IngestionArchiveService,
    private readonly errors: IngestionErrorService,
    private readonly dataQuality: DataQualityService,
  ) {}

  /** I-11 data-quality view: last sync, error rows, unknown reps/orgs, unassignable orders. */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('data-quality')
  overview() {
    return this.dataQuality.overview();
  }

  /** I-10 archive index (without raw payloads). */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('ingestion/archive')
  archiveList() {
    return this.archive.findAll();
  }

  /** I-11 open error list. */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('ingestion/errors')
  errorList() {
    return this.errors.findOpen();
  }

  /**
   * I-10: the immutable raw copy of one archived payload, served byte-for-byte
   * with its original content type so any past import is inspectable as it
   * arrived.
   */
  @Roles(...PHASE1_READ_ROLLEN)
  @Get('ingestion/archive/:id/raw')
  async raw(@Param('id') id: string, @Res() res: Response) {
    const row = await this.archive.findRaw(id);
    res.setHeader('Content-Type', row.contentType ?? 'application/octet-stream');
    if (row.sha256) res.setHeader('X-Payload-Sha256', row.sha256);
    res.send(row.rohdaten ?? '');
  }
}
