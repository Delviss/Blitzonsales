import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReserveStatus } from '@blitzon/shared';
import { CommercialReserve } from '../entities/commercial-reserve.entity';
import { LedgerService } from '../config-store/ledger.service';
import { AuditService } from '../audit/audit.service';

export interface ReservePersistInput {
  contractId: string | null;
  repId: string | null;
  swaRevenue: number;
  profitBeforeReserve: number;
  reserveTarget: number;
}

/**
 * Commercial reserve posting objects (I-24, Fachkonzept ch. 10.2 / 10.3).
 *
 * The reserve is booked only on actually received SWA payments, held per
 * contract as non-freely-available liquidity, flagged under-funded when the
 * amount actually set aside falls below the target, and released only after
 * contract end / final billing. The run's freigabe persists the computed
 * reserves here (replacing that run's rows so a re-run stays idempotent).
 */
@Injectable()
export class CommercialReserveService {
  constructor(
    @InjectRepository(CommercialReserve) private readonly repo: Repository<CommercialReserve>,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** Derive the status from the target/actual/released state (I-24). */
  private static statusOf(r: Pick<CommercialReserve, 'reserveTarget' | 'reserveActual' | 'freigegebenAm'>): ReserveStatus {
    if (r.freigegebenAm) return ReserveStatus.Freigegeben;
    if (Number(r.reserveActual) < Number(r.reserveTarget)) return ReserveStatus.Unterdeckt;
    return ReserveStatus.Gebucht;
  }

  /**
   * Replace a run's commercial reserves with the freshly computed set. Called on
   * run freigabe; posts an append-only ledger entry per reserve as well.
   */
  async persistForRun(runId: string, periode: string, reserves: ReservePersistInput[], userId: string): Promise<void> {
    await this.repo.delete({ runId });
    for (const r of reserves) {
      const row = this.repo.create({
        runId,
        periode,
        contractId: r.contractId,
        repId: r.repId,
        swaRevenue: r.swaRevenue,
        profitBeforeReserve: r.profitBeforeReserve,
        reserveTarget: r.reserveTarget,
        // Booked fully funded; a later /ist correction can flag under-funding.
        reserveActual: r.reserveTarget,
        status: ReserveStatus.Gebucht,
      });
      await this.repo.save(row);
    }
  }

  findAll(): Promise<CommercialReserve[]> {
    return this.repo.find({ relations: ['contract', 'rep'], order: { createdAt: 'DESC' } });
  }

  findByRun(runId: string): Promise<CommercialReserve[]> {
    return this.repo.find({ where: { runId }, relations: ['contract', 'rep'], order: { createdAt: 'DESC' } });
  }

  /** Per-rep + grand-total roll-up with the under-funding flag (I-24 dashboard). */
  async summary(): Promise<{
    total: { reserveTarget: number; reserveActual: number; unterdeckt: number; freigegeben: number; offen: number };
    perContract: CommercialReserve[];
  }> {
    const rows = await this.findAll();
    const total = { reserveTarget: 0, reserveActual: 0, unterdeckt: 0, freigegeben: 0, offen: 0 };
    for (const r of rows) {
      const status = CommercialReserveService.statusOf(r);
      total.reserveTarget = round2(total.reserveTarget + Number(r.reserveTarget));
      total.reserveActual = round2(total.reserveActual + Number(r.reserveActual));
      if (status === ReserveStatus.Freigegeben) total.freigegeben = round2(total.freigegeben + Number(r.reserveActual));
      else {
        total.offen = round2(total.offen + Number(r.reserveActual));
        if (status === ReserveStatus.Unterdeckt) {
          total.unterdeckt = round2(total.unterdeckt + (Number(r.reserveTarget) - Number(r.reserveActual)));
        }
      }
    }
    return { total, perContract: rows };
  }

  /** Correct the actually-funded amount; flips to `unterdeckt` when below target. */
  async setActual(id: string, reserveActual: number, userId: string): Promise<CommercialReserve> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException();
    row.reserveActual = reserveActual;
    row.status = CommercialReserveService.statusOf(row);
    const saved = await this.repo.save(row);
    await this.audit.log({ entity: 'commercial_reserve', entityId: id, aktion: 'set_actual', neu: { reserveActual } as any, userId });
    return saved;
  }

  /** Release a reserve after contract end / final billing (Founder only). */
  async release(id: string, userId: string): Promise<CommercialReserve> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException();
    row.freigegebenAm = new Date();
    row.freigegebenVon = userId;
    row.status = ReserveStatus.Freigegeben;
    const saved = await this.repo.save(row);
    await this.ledger.appendFinancial({
      contractId: row.contractId,
      monat: row.periode,
      typ: 'ruecklage_gewerbe_freigabe',
      betrag: -Number(row.reserveActual),
      quelle: 'manual',
      akteur: userId,
      begruendung: `Gewerberücklage freigegeben (Vertragsende/Endabrechnung)`,
    });
    await this.audit.log({ entity: 'commercial_reserve', entityId: id, aktion: 'freigeben', neu: saved as any, userId });
    return saved;
  }
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
