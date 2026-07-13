import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CollectionsStatus } from '@blitzon/shared';
import { ClawbackReceivable } from '../entities/clawback-receivable.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { clawbackOffset, OffsetSource, OffsetTarget } from '../commissions/fachkonzept/fachkonzept-engine';
import { StornoAccountService } from './storno-account.service';
import { LedgerService } from '../config-store/ledger.service';
import { AuditService } from '../audit/audit.service';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CreateClawbackInput {
  contractId?: string | null;
  swaOrderNumber?: string | null;
  repId: string;
  grund?: string | null;
  /** the full SWA clawback amount (absolute €). */
  swaClawback: number;
  /** the causer's share (e.g. 0.5). */
  causerShare: number;
  /** currently-due commission available for offset (step 2); defaults to 0. */
  currentCommissionAvailable?: number;
}

/**
 * Clawback receivables with the fixed offsetting order (I-25, Fachkonzept ch.
 * 9.4 / 7.5).
 *
 * The causer-accurate pass-through is offset in the fixed order — (1) storno
 * account, (2) current commission, (3) open retention commission — with the
 * storno-account offset actually drawn out of the employee's storno account
 * (I-23). Steps (4) invoice to a departed employee and (5) collections are the
 * disposition of any *remaining* balance, tracked as the receivable's
 * collections status; the remaining balance is always reconstructable.
 */
@Injectable()
export class ClawbackService {
  constructor(
    @InjectRepository(ClawbackReceivable) private readonly repo: Repository<ClawbackReceivable>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(CommissionLine) private readonly lineRepo: Repository<CommissionLine>,
    private readonly storno: StornoAccountService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  private async openRetention(repId: string): Promise<number> {
    const row = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('l.run', 'run')
      .select('COALESCE(SUM(l.betrag), 0)', 'sum')
      .where('l.rep_id = :repId', { repId })
      .andWhere("l.typ = 'gewerbe_ruecklage'")
      .andWhere("run.status = 'freigegeben'")
      .getRawOne<{ sum: string }>();
    return round2(Number(row?.sum ?? 0));
  }

  async create(input: CreateClawbackInput, userId: string): Promise<ClawbackReceivable> {
    if (!(input.swaClawback > 0)) throw new BadRequestException('swaClawback muss positiv sein.');
    if (!(input.causerShare > 0 && input.causerShare <= 1)) throw new BadRequestException('causerShare muss zwischen 0 und 1 liegen.');
    const rep = await this.repRepo.findOne({ where: { id: input.repId } });
    if (!rep) throw new NotFoundException('Verkäufer nicht gefunden.');

    // Live offset sources for steps 1–3 (in the fixed enum order).
    const sources: OffsetSource[] = [
      { target: OffsetTarget.StornoAccount, available: Math.max(0, Number(rep.stornoKontoSaldo)) },
      { target: OffsetTarget.CurrentCommission, available: Math.max(0, input.currentCommissionAvailable ?? 0) },
      { target: OffsetTarget.OpenRetention, available: await this.openRetention(input.repId) },
    ];
    const result = clawbackOffset(input.swaClawback, input.causerShare, sources);

    // Draw the storno-account offset out of the account (I-23) — the others are
    // reconstructable from the receivable but do not mutate a stored balance.
    const stornoOffset = result.offsets.find((o) => o.target === OffsetTarget.StornoAccount);
    if (stornoOffset && stornoOffset.applied > 0) {
      await this.storno.applyClawbackOffset(input.repId, stornoOffset.applied, null, userId, `Clawback ${input.swaOrderNumber ?? input.contractId ?? ''}`.trim());
    }

    // Append-only ledger: the pass-through and each offset.
    await this.ledger.appendFinancial({
      contractId: input.contractId ?? null,
      swaOrderNumber: input.swaOrderNumber ?? null,
      typ: 'clawback',
      betrag: -result.passThrough,
      quelle: 'manual',
      akteur: userId,
      begruendung: input.grund ?? null,
    });

    // Step (4)/(5) disposition of the remaining receivable.
    let inkassoStatus: CollectionsStatus;
    if (result.remaining <= 0) inkassoStatus = CollectionsStatus.Ausgeglichen;
    else if (rep.austrittsdatum) inkassoStatus = CollectionsStatus.Rechnung; // invoice to departed employee
    else inkassoStatus = CollectionsStatus.Offen; // offset against future commission

    const row = this.repo.create({
      contractId: input.contractId ?? null,
      swaOrderNumber: input.swaOrderNumber ?? null,
      repId: input.repId,
      grund: input.grund ?? null,
      swaClawback: round2(input.swaClawback),
      causerShare: input.causerShare,
      passThrough: result.passThrough,
      offsets: result.offsets.map((o) => ({ target: o.target, applied: o.applied })),
      remaining: result.remaining,
      inkassoStatus,
    });
    const saved = await this.repo.save(row);
    await this.audit.log({ entity: 'clawback_receivable', entityId: saved.id, aktion: 'create', neu: saved as any, userId });
    return saved;
  }

  findAll(): Promise<ClawbackReceivable[]> {
    return this.repo.find({ relations: ['contract', 'rep'], order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<ClawbackReceivable> {
    const row = await this.repo.findOne({ where: { id }, relations: ['contract', 'rep'] });
    if (!row) throw new NotFoundException();
    return row;
  }

  /** Record an invoice / payment / collections escalation against the remainder. */
  async update(
    id: string,
    patch: { rechnungRef?: string; zahlung?: number; inkassoStatus?: CollectionsStatus },
    userId: string,
  ): Promise<ClawbackReceivable> {
    const row = await this.findOne(id);
    if (patch.rechnungRef !== undefined) row.rechnungRef = patch.rechnungRef;
    if (patch.zahlung !== undefined) {
      row.zahlung = round2(Number(patch.zahlung));
      row.remaining = round2(Math.max(0, Number(row.passThrough) - offsetsTotal(row) - row.zahlung));
    }
    if (patch.inkassoStatus !== undefined) row.inkassoStatus = patch.inkassoStatus;
    if (Number(row.remaining) <= 0) row.inkassoStatus = CollectionsStatus.Ausgeglichen;
    const saved = await this.repo.save(row);
    await this.audit.log({ entity: 'clawback_receivable', entityId: id, aktion: 'update', neu: patch as any, userId });
    return saved;
  }
}

function offsetsTotal(row: ClawbackReceivable): number {
  return round2((row.offsets ?? []).reduce((s, o) => s + Number(o.applied), 0));
}
