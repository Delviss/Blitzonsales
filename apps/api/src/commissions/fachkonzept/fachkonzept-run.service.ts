import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigKey, OrgType, RunStatus, TariffEnergyType, Tier } from '@blitzon/shared';
import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';
import { Contract } from '../../entities/contract.entity';
import { SalesRep } from '../../entities/sales-rep.entity';
import { MonthClose } from '../../entities/month-close.entity';
import { AuditService } from '../../audit/audit.service';
import { BusinessConfigService } from '../../config-store/business-config.service';
import { LedgerService } from '../../config-store/ledger.service';
import { StatusMasterService } from '../../status-master/status-master.service';
import { CommercialReserveService } from '../../posting-objects/commercial-reserve.service';
import { StornoAccountService } from '../../posting-objects/storno-account.service';
import {
  AddendumContract,
  computeFachkonzeptRun,
  FachkonzeptRunConfig,
  FachkonzeptRunResult,
  RunContract,
  RunRep,
} from './fachkonzept-run';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Persists a Fachkonzept Provisionslauf: resolves the versioned config as-of the
 * period, loads the month's contracts + rep master data, runs the pure
 * orchestrator (`computeFachkonzeptRun`), and stores the resulting lines plus the
 * per-rep salary/storno summary. On Freigabe it posts the rep balance deltas
 * (negativsaldo / storno account) and writes the append-only financial ledger.
 *
 * Coexists with the legacy `CommissionRunsService` on the same tables via
 * `commission_run.verfahren = 'fachkonzept'`.
 */
@Injectable()
export class FachkonzeptRunService {
  constructor(
    @InjectRepository(CommissionRun) private readonly runRepo: Repository<CommissionRun>,
    @InjectRepository(CommissionLine) private readonly lineRepo: Repository<CommissionLine>,
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(MonthClose) private readonly monthCloseRepo: Repository<MonthClose>,
    private readonly config: BusinessConfigService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly statusMaster: StatusMasterService,
    private readonly reserves: CommercialReserveService,
    private readonly storno: StornoAccountService,
  ) {}

  findAll(organisationId?: string) {
    const where = organisationId
      ? { organisationId, verfahren: 'fachkonzept' }
      : { verfahren: 'fachkonzept' };
    return this.runRepo.find({ where, relations: ['organisation'], order: { periode: 'DESC' } });
  }

  async create(data: { periode: string; organisationId?: string | null }, userId: string) {
    if (!data.periode || !PERIODE_RE.test(data.periode)) {
      throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
    }
    // I-34: a closed month is frozen — no run may be created for it. Later SWA
    // information surfaces only as an addendum in the current open month.
    await this.assertNotClosed(data.periode);
    const run = this.runRepo.create({
      periode: data.periode,
      organisationId: data.organisationId ?? null,
      status: RunStatus.Entwurf,
      verfahren: 'fachkonzept',
      createdBy: userId,
    });
    const saved = await this.runRepo.save(run);
    await this.audit.log({ entity: 'commission_run', entityId: saved.id, aktion: 'create_fachkonzept', neu: saved as any, userId });
    await this.generate(saved.id, userId);
    return this.findOne(saved.id);
  }

  /** (Re-)computes the draft lines + summary. Idempotent while the run is entwurf. */
  async generate(runId: string, userId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException();
    if (run.verfahren !== 'fachkonzept') {
      throw new ConflictException('Kein Fachkonzept-Lauf.');
    }
    if (run.status !== RunStatus.Entwurf) {
      throw new ConflictException('Nur Entwürfe können neu berechnet werden.');
    }
    // I-34: never recompute a run whose month has since been closed (frozen).
    await this.assertNotClosed(run.periode);

    const result = await this.compute(run);

    // Replace this run's lines only (a run is owned by exactly one engine).
    await this.lineRepo.delete({ runId });
    const rows = result.lines.map((l) =>
      this.lineRepo.create({
        runId,
        contractId: l.contractId,
        repId: l.repId,
        regelId: null,
        betrag: l.betrag,
        typ: l.kategorie,
        begruendung: l.begruendung,
        datencheck: l.datencheck,
      }),
    );
    await this.lineRepo.save(rows);

    // I-14: persist the expected/deviation/plausibility onto each contract so the
    // deviation report and the master-data view surface it (the actual SWA list
    // stays the booking truth; we only record the comparison).
    for (const p of result.plausibilities) {
      await this.contractRepo.update(
        { id: p.contractId },
        {
          erwarteteSwaProvision: p.erwartet,
          tatsaechlicheSwaProvision: p.tatsaechlich,
          abweichung: p.abweichung,
          plausibilitaetStatus: p.status,
        },
      );
    }

    run.fachkonzeptZusammenfassung = {
      repSummaries: result.repSummaries,
      reserves: result.reserves,
      plausibilities: result.plausibilities,
      swaTier: result.swaTier,
      totals: result.totals,
      warnungen: result.warnungen,
    };
    await this.runRepo.save(run);
    await this.audit.log({
      entity: 'commission_run',
      entityId: runId,
      aktion: 'generate_fachkonzept',
      neu: { anzahlZeilen: rows.length, totals: result.totals } as any,
      userId,
    });
    return this.findOne(runId);
  }

  async freigeben(runId: string, userId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException();
    if (run.verfahren !== 'fachkonzept') throw new ConflictException('Kein Fachkonzept-Lauf.');
    if (run.status === RunStatus.Freigegeben) throw new ConflictException('Lauf ist bereits freigegeben.');
    if (run.createdBy && run.createdBy === userId) {
      throw new ConflictException('Vier-Augen-Prinzip: Der Ersteller eines Laufs kann ihn nicht selbst freigeben.');
    }
    // I-34: a closed month is frozen — its run can no longer be approved/booked.
    await this.assertNotClosed(run.periode);

    const summary = (run.fachkonzeptZusammenfassung ?? {}) as {
      repSummaries?: FachkonzeptRunResult['repSummaries'];
      reserves?: FachkonzeptRunResult['reserves'];
    };

    // Post the salary-protection balance deltas to each rep (I-18). freigeben is
    // one-way (rejects an already-approved run) so this is applied exactly once.
    for (const rep of summary.repSummaries ?? []) {
      // Negative-commission balance: +accrual (low month) / −recovery (high month, I-18).
      if (rep.negativsaldoDelta !== 0) {
        await this.repRepo.increment({ id: rep.repId }, 'negativsaldo', rep.negativsaldoDelta);
        await this.ledger.appendFinancial({
          monat: run.periode,
          typ: rep.negativsaldoDelta > 0 ? 'negativsaldo_vorschuss' : 'negativsaldo_tilgung',
          betrag: rep.negativsaldoDelta,
          quelle: 'run', akteur: userId, begruendung: `Provisionslauf ${run.id}`,
        });
      }
      // 10% storno withholding, split into the private/commercial reserved
      // shares of the storno account posting object (I-18 → I-23).
      const privat = rep.stornoEinbehaltPrivat ?? rep.stornoEinbehalt ?? 0;
      const gewerbe = rep.stornoEinbehaltGewerbe ?? 0;
      await this.storno.applyWithholding(rep.repId, privat, gewerbe, run.periode, userId, 'run', `Provisionslauf ${run.id}`);
    }

    // Commercial reserves become persisted posting objects (I-24) and keep an
    // append-only ledger entry each for the audit trail.
    await this.reserves.persistForRun(
      run.id,
      run.periode,
      (summary.reserves ?? []).map((r) => ({
        contractId: r.contractId,
        repId: r.repId,
        swaRevenue: r.swaRevenue,
        profitBeforeReserve: r.profitBeforeReserve,
        reserveTarget: r.reserveTarget,
      })),
      userId,
    );
    for (const r of summary.reserves ?? []) {
      await this.ledger.appendFinancial({
        contractId: r.contractId, monat: run.periode, typ: 'ruecklage_gewerbe', betrag: r.reserveTarget,
        quelle: 'run', akteur: userId, begruendung: `Provisionslauf ${run.id}`,
      });
    }

    const alt = { ...run };
    run.status = RunStatus.Freigegeben;
    run.freigegebenVon = userId;
    run.freigegebenAm = new Date();
    const saved = await this.runRepo.save(run);
    await this.audit.log({ entity: 'commission_run', entityId: runId, aktion: 'freigeben_fachkonzept', alt: alt as any, neu: saved as any, userId });
    return this.findOne(runId);
  }

  async findOne(runId: string) {
    const run = await this.runRepo.findOne({ where: { id: runId }, relations: ['organisation'] });
    if (!run) throw new NotFoundException();
    const lines = await this.lineRepo.find({
      where: { runId },
      relations: ['contract', 'contract.organisation', 'rep'],
      order: { typ: 'ASC', id: 'ASC' },
    });
    return { run, lines, summary: run.fachkonzeptZusammenfassung ?? null };
  }

  /**
   * Provisional projection for a period from the *current* live data, without
   * persisting anything (I-16). Reuses the exact same computation as a real run
   * so the forecast and the eventual booking never diverge; the caller marks the
   * result "provisional" and layers the reversal warnings on top.
   */
  async preview(periode: string, organisationId?: string | null): Promise<FachkonzeptRunResult> {
    if (!periode || !PERIODE_RE.test(periode)) {
      throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
    }
    return this.computeForPeriod(periode, organisationId ?? null);
  }

  // -- internals -------------------------------------------------------------

  private compute(run: CommissionRun): Promise<FachkonzeptRunResult> {
    return this.computeForPeriod(run.periode, run.organisationId);
  }

  private async computeForPeriod(periode: string, organisationId: string | null): Promise<FachkonzeptRunResult> {
    const asOf = this.periodEnd(periode);
    const config = await this.resolveConfig(asOf);
    // I-06: the tier engine reads the qualifying-status set only from the status
    // master, resolved as-of the period. Any status not explicitly released as
    // qualifying (incl. statuses absent from the master) never counts.
    config.qualifyingStatuses = await this.statusMaster.qualifyingCodes(asOf);

    const reps = await this.repRepo.find({ relations: ['organisation'] });
    const runReps: RunRep[] = reps.map((r) => ({
      id: r.id,
      isPartner: r.organisation?.orgTyp === OrgType.Partner,
      trainerId: r.trainerId,
      teamleadId: r.teamleadId,
      negativsaldo: Number(r.negativsaldo ?? 0),
      aktiv: r.aktiv !== false,
      // I-26: open risks = a carried negative balance or a non-empty storno risk
      // buffer. An inactive rep with either is blocked from standard payouts.
      offeneRisiken: Number(r.negativsaldo ?? 0) > 0 || Number(r.stornoKontoSaldo ?? 0) > 0,
    }));

    const where = organisationId ? { organisationId } : {};
    const allContracts = await this.contractRepo.find({ where });
    // I-11: data-quality-gated contracts get no automatic booking until the
    // flagged record is corrected (Fachkonzept ch. 11.1 „Datenqualität").
    const bookable = allContracts.filter((ct) => !ct.datenqualitaetGesperrt);
    const contracts: RunContract[] = bookable
      .filter((ct) => (ct.erfassungsdatum ?? '').startsWith(periode))
      .map((ct) => this.toRunContract(ct));

    // I-34/I-17: contracts whose original month is already closed are frozen
    // there; if such a contract only became commissionable afterwards it is
    // booked in this open month as an addendum referencing the original month.
    const addenda = await this.collectAddenda(periode, bookable);

    return computeFachkonzeptRun({ periode, config, reps: runReps, contracts, addenda });
  }

  /** Normalize a contract row into exactly what the engine consumes. */
  private toRunContract(ct: Contract): RunContract {
    const isGas = ct.tariffEnergyType === TariffEnergyType.Gas;
    const surcharge = isGas ? ct.rateExtraProfitProvisionGp : ct.rateExtraProfitProvision;
    return {
      id: ct.id,
      repId: ct.repId,
      status: ct.status,
      clientType: ct.clientType,
      startDeliveryType: ct.startDeliveryType,
      energie: ct.tariffEnergyType,
      verbrauch: ct.verbrauch,
      gesamtverbrauch: num(ct.previousVolume) ?? ct.verbrauch,
      surchargeCt: num(surcharge),
      swaRevenue: num(ct.swaZahlbetrag),
      // I-36: a manual override takes precedence as the booking value; the
      // original SWA figures stay visible on the contract (never overwritten).
      actualSwaProvision:
        num(ct.manuellerOverride) ?? num(ct.tatsaechlicheSwaProvision) ?? num(ct.swaGesamtprovision),
      kreditcheckConfirmed: !!ct.kreditcheckDatum,
      lieferbeginnConfirmed: !!ct.lieferbeginn,
    };
  }

  /**
   * Addendum candidates for the open `periode` (I-34/I-17): non-gated contracts
   * whose capture month is an earlier, already-closed month and that were not yet
   * booked in any closed month. They are booked now, tagged with the original
   * (frozen) month + SWA order number, without reopening the closed month.
   */
  private async collectAddenda(periode: string, bookable: Contract[]): Promise<AddendumContract[]> {
    const closed = await this.monthCloseRepo.find({ where: { status: 'geschlossen' } });
    if (closed.length === 0) return [];
    const closedPeriods = new Set(closed.map((c) => c.periode));
    const alreadyBooked = new Set<string>();
    for (const c of closed) for (const id of c.gebuchteVertragIds ?? []) alreadyBooked.add(id);

    return bookable
      .filter((ct) => {
        const monat = (ct.erfassungsdatum ?? '').slice(0, 7);
        return monat && monat < periode && closedPeriods.has(monat) && !alreadyBooked.has(ct.id);
      })
      .map((ct) => ({
        ...this.toRunContract(ct),
        urspruungsMonat: (ct.erfassungsdatum ?? '').slice(0, 7),
        swaOrderNumber: ct.swaOrderNumber ?? null,
      }));
  }

  /** I-34: reject any run mutation on a frozen (closed) month. */
  private async assertNotClosed(periode: string): Promise<void> {
    const row = await this.monthCloseRepo.findOne({ where: { periode } });
    if (row && row.status === 'geschlossen') {
      throw new ConflictException(
        `Monat ${periode} ist abgeschlossen (eingefroren). Spätere SWA-Informationen erscheinen als Nachtrag im laufenden Monat.`,
      );
    }
  }

  private periodEnd(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  private async resolveConfig(asOf: string): Promise<FachkonzeptRunConfig> {
    const g = async <T>(key: ConfigKey) => (await this.config.resolve<T>(key, asOf)) as T;
    return {
      // Filled from the status master by compute() (I-06); see StatusMasterService.
      qualifyingStatuses: [],
      minConsumptionStrom: await g<number>(ConfigKey.MinConsumptionStrom),
      minConsumptionGas: await g<number>(ConfigKey.MinConsumptionGas),
      employeeTier: await g<Tier[]>(ConfigKey.EmployeeTier),
      partnerTier: await g<Tier[]>(ConfigKey.PartnerTier),
      swaNewCustomerTier: await g<Tier[]>(ConfigKey.SwaNewCustomerTier),
      plausibilityToleranceAbs: (await this.config.resolve<number>(ConfigKey.PlausibilityToleranceAbs, asOf)) ?? 1,
      fixum: await g<number>(ConfigKey.Fixum),
      employerCostRate: await g<number>(ConfigKey.EmployerCostRate),
      overheadTrainerNew: await g<number>(ConfigKey.OverheadTrainerNew),
      overheadTrainerCommercial: await g<number>(ConfigKey.OverheadTrainerCommercial),
      overheadTeamLeadNew: await g<number>(ConfigKey.OverheadTeamLeadNew),
      overheadTeamLeadCommercial: await g<number>(ConfigKey.OverheadTeamLeadCommercial),
      existingCustomerSwaRevenue: await g<number>(ConfigKey.ExistingCustomerSwaRevenue),
      existingCustomerEmployeePayout: await g<number>(ConfigKey.ExistingCustomerEmployeePayout),
      existingCustomerPartnerPayout: await g<number>(ConfigKey.ExistingCustomerPartnerPayout),
      commercialShareEmployeeImmediate: await g<number>(ConfigKey.CommercialShareEmployeeImmediate),
      commercialShareEmployeeRetention: await g<number>(ConfigKey.CommercialShareEmployeeRetention),
      commercialSharePartnerImmediate: await g<number>(ConfigKey.CommercialSharePartnerImmediate),
      commercialSharePartnerRetention: await g<number>(ConfigKey.CommercialSharePartnerRetention),
      commercialSurchargeCapStrom: await g<number>(ConfigKey.CommercialSurchargeCapStrom),
      commercialSurchargeCapGas: await g<number>(ConfigKey.CommercialSurchargeCapGas),
      commercialReserveRate: await g<number>(ConfigKey.CommercialReserveRate),
      stornoAccountRate: await g<number>(ConfigKey.StornoAccountRate),
    };
  }
}
