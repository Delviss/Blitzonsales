import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesRep } from '../entities/sales-rep.entity';
import { ClawbackReceivable } from '../entities/clawback-receivable.entity';
import { LedgerService } from '../config-store/ledger.service';
import { AuditService } from '../audit/audit.service';

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Every ch. 10.1 field of a storno account, per employee (I-23). */
export interface StornoAccountView {
  repId: string;
  name: string;
  /** total balance (gesamtsaldo = privat + gewerbe − clawbacks − freigegeben). */
  gesamtsaldo: number;
  /** privately-reserved share (10% of private commission). */
  privatAnteil: number;
  /** commercially-reserved share (10% of commercial commission). */
  gewerbeAnteil: number;
  /** used clawbacks (offsets taken from the account, I-25). */
  genutzteClawbacks: number;
  /** manually released amounts. */
  manuellFreigegeben: number;
  /** open receivables offset against this account (clawback remainders). */
  offeneForderungen: number;
  /** freely-available amount (balance not committed against open receivables). */
  freiVerfuegbar: number;
}

/**
 * Employee storno accounts as posting objects (I-23, Fachkonzept ch. 10.1).
 *
 * Storno accounts are liabilities / risk buffers, never free profit. Each is fed
 * by the 10% withholding (I-18, split into a private and a commercial share) and
 * drawn down by clawback offsets (I-25) and manual releases. The balances are
 * maintained as cumulative running totals on `sales_rep`; this service exposes
 * the full ch. 10.1 breakdown per employee and in total, and performs the
 * account mutations (withholding, clawback offset, manual release) so the two
 * accounts (negative balance vs. storno) never mix.
 */
@Injectable()
export class StornoAccountService {
  constructor(
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(ClawbackReceivable) private readonly clawbackRepo: Repository<ClawbackReceivable>,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  /** Post the monthly 10% withholding to a rep's storno account (called on freigabe). */
  async applyWithholding(
    repId: string,
    privat: number,
    gewerbe: number,
    monat: string,
    userId: string,
    quelle = 'run',
    begruendung?: string,
  ): Promise<void> {
    if (privat <= 0 && gewerbe <= 0) return;
    const total = round2(privat + gewerbe);
    await this.repRepo.increment({ id: repId }, 'stornoKontoSaldo', total);
    if (privat > 0) await this.repRepo.increment({ id: repId }, 'stornoPrivatEinbehalt', privat);
    if (gewerbe > 0) await this.repRepo.increment({ id: repId }, 'stornoGewerbeEinbehalt', gewerbe);
    if (privat > 0) {
      await this.ledger.appendFinancial({ monat, typ: 'storno_einbehalt_privat', betrag: privat, quelle, akteur: userId, begruendung });
    }
    if (gewerbe > 0) {
      await this.ledger.appendFinancial({ monat, typ: 'storno_einbehalt_gewerbe', betrag: gewerbe, quelle, akteur: userId, begruendung });
    }
  }

  /**
   * Draw a clawback offset out of the storno account (I-25). Caps at the current
   * balance and returns the amount actually applied so the caller can continue
   * the fixed offset order with the remainder.
   */
  async applyClawbackOffset(repId: string, amount: number, monat: string | null, userId: string, begruendung?: string): Promise<number> {
    if (amount <= 0) return 0;
    const rep = await this.repRepo.findOne({ where: { id: repId } });
    if (!rep) return 0;
    const applied = round2(Math.min(amount, Math.max(0, Number(rep.stornoKontoSaldo))));
    if (applied <= 0) return 0;
    await this.repRepo.increment({ id: repId }, 'stornoKontoSaldo', -applied);
    await this.repRepo.increment({ id: repId }, 'stornoClawbackGenutzt', applied);
    await this.ledger.appendFinancial({ monat, typ: 'storno_clawback_offset', betrag: -applied, quelle: 'manual', akteur: userId, begruendung });
    return applied;
  }

  /**
   * Manually release a part of the storno account (I-26, Fachkonzept ch. 7.5 /
   * 10.1). Storno credit is never auto-paid: a partial release is always a
   * deliberate Founder/Backoffice action requiring an amount, a release date, the
   * approving person and a reason (e.g. bridging sickness/holiday). Every release
   * is fully audited (audit log + append-only ledger entry).
   */
  async release(
    repId: string,
    input: { betrag: number; datum?: string | null; genehmigtVon?: string | null; grund?: string | null },
    userId: string,
  ): Promise<StornoAccountView> {
    const rep = await this.repRepo.findOne({ where: { id: repId } });
    if (!rep) throw new NotFoundException();
    const amt = round2(input.betrag);
    if (!Number.isFinite(amt) || amt <= 0) throw new BadRequestException('Freigabebetrag muss positiv sein.');
    if (amt > Number(rep.stornoKontoSaldo)) throw new BadRequestException('Freigabebetrag übersteigt den Saldo des Stornokontos.');
    const grund = (input.grund ?? '').trim();
    if (!grund) throw new BadRequestException('Eine Begründung ist für jede Storno-Freigabe erforderlich.');
    const datum = input.datum || new Date().toISOString().slice(0, 10);
    const genehmigtVon = (input.genehmigtVon ?? '').trim() || userId;
    const monat = datum.slice(0, 7);
    const begruendung = `Freigabe am ${datum} durch ${genehmigtVon}: ${grund}`;

    await this.repRepo.increment({ id: repId }, 'stornoKontoSaldo', -amt);
    await this.repRepo.increment({ id: repId }, 'stornoFreigegeben', amt);
    await this.ledger.appendFinancial({ monat, typ: 'storno_freigabe', betrag: -amt, quelle: 'manual', akteur: userId, begruendung });
    await this.audit.log({
      entity: 'sales_rep',
      entityId: repId,
      aktion: 'storno_freigabe',
      neu: { betrag: amt, datum, genehmigtVon, grund } as any,
      userId,
    });
    return (await this.summary(repId))[0];
  }

  /** ch. 10.1 breakdown per employee (all reps, or a single rep). */
  async summary(repId?: string): Promise<StornoAccountView[]> {
    const reps = repId ? [await this.repRepo.findOne({ where: { id: repId } })] : await this.repRepo.find({ order: { name: 'ASC' } });
    const open = await this.clawbackRepo
      .createQueryBuilder('c')
      .select('c.rep_id', 'repId')
      .addSelect('COALESCE(SUM(c.remaining), 0)', 'offen')
      .where("c.inkasso_status <> 'ausgeglichen'")
      .groupBy('c.rep_id')
      .getRawMany<{ repId: string; offen: string }>();
    const openByRep = new Map(open.map((o) => [o.repId, Number(o.offen)]));

    const views: StornoAccountView[] = [];
    for (const rep of reps) {
      if (!rep) continue;
      const gesamtsaldo = round2(Number(rep.stornoKontoSaldo));
      const offeneForderungen = round2(openByRep.get(rep.id) ?? 0);
      views.push({
        repId: rep.id,
        name: rep.name,
        gesamtsaldo,
        privatAnteil: round2(Number(rep.stornoPrivatEinbehalt)),
        gewerbeAnteil: round2(Number(rep.stornoGewerbeEinbehalt)),
        genutzteClawbacks: round2(Number(rep.stornoClawbackGenutzt)),
        manuellFreigegeben: round2(Number(rep.stornoFreigegeben)),
        offeneForderungen,
        freiVerfuegbar: round2(Math.max(0, gesamtsaldo - offeneForderungen)),
      });
    }
    return views;
  }

  /** Grand-total roll-up across all employees (I-23 acceptance). */
  async total(): Promise<Omit<StornoAccountView, 'repId' | 'name'>> {
    const views = await this.summary();
    return views.reduce(
      (acc, v) => ({
        gesamtsaldo: round2(acc.gesamtsaldo + v.gesamtsaldo),
        privatAnteil: round2(acc.privatAnteil + v.privatAnteil),
        gewerbeAnteil: round2(acc.gewerbeAnteil + v.gewerbeAnteil),
        genutzteClawbacks: round2(acc.genutzteClawbacks + v.genutzteClawbacks),
        manuellFreigegeben: round2(acc.manuellFreigegeben + v.manuellFreigegeben),
        offeneForderungen: round2(acc.offeneForderungen + v.offeneForderungen),
        freiVerfuegbar: round2(acc.freiVerfuegbar + v.freiVerfuegbar),
      }),
      { gesamtsaldo: 0, privatAnteil: 0, gewerbeAnteil: 0, genutzteClawbacks: 0, manuellFreigegeben: 0, offeneForderungen: 0, freiVerfuegbar: 0 },
    );
  }
}
