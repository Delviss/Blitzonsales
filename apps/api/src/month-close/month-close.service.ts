import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MonthClose } from '../entities/month-close.entity';
import { AuditService } from '../audit/audit.service';
import { FachkonzeptRunService } from '../commissions/fachkonzept/fachkonzept-run.service';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface MonthCloseStatus {
  periode: string;
  closed: boolean;
  geschlossenAm: Date | null;
  geschlossenVon: string | null;
  wiederGeoeffnetAm: Date | null;
  reopenGrund: string | null;
  snapshot: unknown | null;
}

/**
 * Month-end close & freeze (I-34, Fachkonzept ch. 12.3 / 5.2).
 *
 * `close` freezes a billing month: it snapshots the month's figures (reusing the
 * exact run computation) and records which contracts were commissionable, so the
 * closed month's numbers are immutable and a later, newly-commissionable
 * contract can be told apart from one already booked. `reopen` is Founder/Admin
 * only, requires a reason and is audited. `closedBookedSets` / `isClosed` feed
 * the run so the addendum mechanism (I-17) never reopens a closed month.
 */
@Injectable()
export class MonthCloseService {
  constructor(
    @InjectRepository(MonthClose) private readonly repo: Repository<MonthClose>,
    private readonly runService: FachkonzeptRunService,
    private readonly audit: AuditService,
  ) {}

  private static assertPeriode(periode: string): void {
    if (!periode || !PERIODE_RE.test(periode)) {
      throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
    }
  }

  list(): Promise<MonthClose[]> {
    return this.repo.find({ order: { periode: 'DESC' } });
  }

  async status(periode: string): Promise<MonthCloseStatus> {
    MonthCloseService.assertPeriode(periode);
    const row = await this.repo.findOne({ where: { periode } });
    return {
      periode,
      closed: !!row && row.status === 'geschlossen',
      geschlossenAm: row?.geschlossenAm ?? null,
      geschlossenVon: row?.geschlossenVon ?? null,
      wiederGeoeffnetAm: row?.wiederGeoeffnetAm ?? null,
      reopenGrund: row?.reopenGrund ?? null,
      snapshot: row?.snapshot ?? null,
    };
  }

  /** True iff the month is currently closed (frozen). */
  async isClosed(periode: string): Promise<boolean> {
    const row = await this.repo.findOne({ where: { periode } });
    return !!row && row.status === 'geschlossen';
  }

  /**
   * All currently-closed months with the set of contract ids that were
   * commissionable in each (the "already booked" set). The run uses the union to
   * pick up newly-commissionable contracts from closed months as addenda (I-34).
   */
  async closedBookedSets(): Promise<Array<{ periode: string; ids: Set<string> }>> {
    const rows = await this.repo.find({ where: { status: 'geschlossen' } });
    return rows.map((r) => ({ periode: r.periode, ids: new Set(r.gebuchteVertragIds ?? []) }));
  }

  /**
   * Close a billing month. Snapshots the month's figures and records the booked
   * contract ids so the month is provably immutable. Idempotent guard: refuses to
   * close a month that is already closed.
   */
  async close(periode: string, userId: string): Promise<MonthCloseStatus> {
    MonthCloseService.assertPeriode(periode);
    const existing = await this.repo.findOne({ where: { periode } });
    if (existing && existing.status === 'geschlossen') {
      throw new ConflictException(`Monat ${periode} ist bereits abgeschlossen.`);
    }

    // Reuse the exact run computation so the frozen snapshot matches the booking
    // logic (never a divergent number). preview() persists nothing.
    const result = await this.runService.preview(periode);
    const bookedIds = Array.from(
      new Set(
        result.lines
          // a contract counts as "booked" when it produced any real line other
          // than an unqualified placeholder.
          .filter((l) => l.kategorie !== 'neukunde_unqualifiziert')
          .map((l) => l.contractId),
      ),
    );

    const snapshot = {
      repSummaries: result.repSummaries,
      swaTier: result.swaTier,
      totals: result.totals,
      reserves: result.reserves,
      anzahlZeilen: result.lines.length,
    };

    const row =
      existing ??
      this.repo.create({ periode });
    row.status = 'geschlossen';
    row.snapshot = snapshot;
    row.gebuchteVertragIds = bookedIds;
    row.geschlossenAm = new Date();
    row.geschlossenVon = userId;
    const saved = await this.repo.save(row);

    await this.audit.log({
      entity: 'month_close',
      entityId: saved.id,
      aktion: 'close',
      neu: { periode, totals: result.totals, anzahlGebucht: bookedIds.length } as any,
      userId,
    });
    return this.status(periode);
  }

  /**
   * Reopen a closed month (Founder/Admin only — enforced at the controller).
   * Requires a reason; both the reason and the actor are audited. The frozen
   * snapshot is kept for the record.
   */
  async reopen(periode: string, grund: string, userId: string): Promise<MonthCloseStatus> {
    MonthCloseService.assertPeriode(periode);
    const reason = (grund ?? '').trim();
    if (!reason) throw new BadRequestException('Eine Begründung ist für jede Wiederöffnung erforderlich.');
    const row = await this.repo.findOne({ where: { periode } });
    if (!row || row.status !== 'geschlossen') {
      throw new NotFoundException(`Monat ${periode} ist nicht abgeschlossen.`);
    }
    const alt = { status: row.status };
    row.status = 'offen';
    row.wiederGeoeffnetAm = new Date();
    row.wiederGeoeffnetVon = userId;
    row.reopenGrund = reason;
    const saved = await this.repo.save(row);
    await this.audit.log({
      entity: 'month_close',
      entityId: saved.id,
      aktion: 'reopen',
      alt: alt as any,
      neu: { periode, grund: reason } as any,
      userId,
    });
    return this.status(periode);
  }
}
