import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { IngestionSource } from '@blitzon/shared';
import { IngestionArchive } from '../entities/ingestion-archive.entity';

export interface ArchiveInput {
  quelle: IngestionSource | string;
  referenz?: string | null;
  akteur?: string | null;
  contentType?: string | null;
  /** The raw payload, stored verbatim. Buffers are decoded as utf-8 text. */
  rohdaten: Buffer | string;
  satzAnzahl?: number;
  fehlerAnzahl?: number;
  meta?: Record<string, unknown> | null;
}

/**
 * Writes and reads the immutable ingestion archive (I-10, Fachkonzept ch. 12.2).
 * Every write stores a byte-for-byte raw copy plus a SHA-256 so an auditor can
 * prove the copy is untampered; rows are never updated or deleted.
 */
@Injectable()
export class IngestionArchiveService {
  constructor(
    @InjectRepository(IngestionArchive)
    private readonly repo: Repository<IngestionArchive>,
  ) {}

  async archive(input: ArchiveInput): Promise<IngestionArchive> {
    const raw = Buffer.isBuffer(input.rohdaten) ? input.rohdaten.toString('utf8') : input.rohdaten;
    const sha256 = createHash('sha256')
      .update(Buffer.isBuffer(input.rohdaten) ? input.rohdaten : Buffer.from(input.rohdaten, 'utf8'))
      .digest('hex');
    return this.repo.save(
      this.repo.create({
        quelle: input.quelle,
        referenz: input.referenz ?? null,
        akteur: input.akteur ?? null,
        contentType: input.contentType ?? null,
        satzAnzahl: input.satzAnzahl ?? 0,
        fehlerAnzahl: input.fehlerAnzahl ?? 0,
        sha256,
        rohdaten: raw,
        meta: input.meta ?? null,
      }),
    );
  }

  /** Update the record/error counts once processing of an archived payload finishes. */
  async setCounts(id: string, satzAnzahl: number, fehlerAnzahl: number): Promise<void> {
    await this.repo.update({ id }, { satzAnzahl, fehlerAnzahl });
  }

  /** Archive list without the (potentially large) raw payload. */
  findAll(limit = 100): Promise<IngestionArchive[]> {
    return this.repo.find({
      order: { zeitpunkt: 'DESC' },
      take: limit,
      select: ['id', 'quelle', 'referenz', 'akteur', 'satzAnzahl', 'fehlerAnzahl', 'contentType', 'sha256', 'meta', 'zeitpunkt'],
    });
  }

  /** The full row including the immutable raw copy, for byte-for-byte inspection. */
  async findRaw(id: string): Promise<IngestionArchive> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Archiveintrag nicht gefunden.');
    return row;
  }
}
