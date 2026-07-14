import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionErrorItem, IngestionSource } from '@blitzon/shared';
import { IngestionError } from '../entities/ingestion-error.entity';
import { IngestionRecordView } from './ingestion-validation';

export interface RecordErrorInput {
  quelle: IngestionSource | string;
  archiveId?: string | null;
  record: IngestionRecordView;
  items: IngestionErrorItem[];
  rohzeile?: Record<string, unknown> | null;
}

/**
 * Persists and reads the data-quality error list (I-11). One row per finding, so
 * the data-quality view can group by category, by rep and by organisation.
 */
@Injectable()
export class IngestionErrorService {
  constructor(
    @InjectRepository(IngestionError)
    private readonly repo: Repository<IngestionError>,
  ) {}

  /**
   * Record the findings for one flagged record. Any earlier *open* findings for
   * the same order number are marked resolved first, so a record that is
   * re-ingested cleanly (or with a different set of problems) does not leave
   * stale rows in the data-quality view.
   */
  async record(input: RecordErrorInput): Promise<void> {
    if (input.record.swaOrderNumber) {
      await this.resolveOpen(input.record.swaOrderNumber);
    }
    if (input.items.length === 0) return;
    const rows = input.items.map((it) =>
      this.repo.create({
        quelle: input.quelle,
        archiveId: input.archiveId ?? null,
        swaOrderNumber: input.record.swaOrderNumber,
        joulesId: input.record.joulesId,
        repName: input.record.repName,
        orgName: input.record.orgName,
        kategorie: it.kategorie,
        feld: it.feld ?? null,
        grund: it.grund,
        rohzeile: input.rohzeile ?? null,
        behoben: false,
      }),
    );
    await this.repo.save(rows);
  }

  /** Mark every open finding for an order number resolved (record now clean). */
  async resolveOpen(swaOrderNumber: string): Promise<void> {
    await this.repo.update({ swaOrderNumber, behoben: false }, { behoben: true });
  }

  /** All still-open findings, newest first. */
  findOpen(limit = 500): Promise<IngestionError[]> {
    return this.repo.find({ where: { behoben: false }, order: { createdAt: 'DESC' }, take: limit });
  }
}
