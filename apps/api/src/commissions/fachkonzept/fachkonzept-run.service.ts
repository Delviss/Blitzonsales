import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigKey, OrgType, RunStatus, TariffEnergyType, Tier } from '@blitzon/shared';
import { CommissionRun } from '../../entities/commission-run.entity';
import { CommissionLine } from '../../entities/commission-line.entity';
import { Contract } from '../../entities/contract.entity';
import { SalesRep } from '../../entities/sales-rep.entity';
import { AuditService } from '../../audit/audit.service';
import { BusinessConfigService } from '../../config-store/business-config.service';
import { LedgerService } from '../../config-store/ledger.service';
import {
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
    private readonly config: BusinessConfigService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
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

    run.fachkonzeptZusammenfassung = {
      repSummaries: result.repSummaries,
      reserves: result.reserves,
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

    const summary = (run.fachkonzeptZusammenfassung ?? {}) as {
      repSummaries?: FachkonzeptRunResult['repSummaries'];
      reserves?: FachkonzeptRunResult['reserves'];
    };

    // Post the salary-protection balance deltas to each rep (I-18). freigeben is
    // one-way (rejects an already-approved run) so this is applied exactly once.
    for (const rep of summary.repSummaries ?? []) {
      if (rep.negativsaldoDelta === 0 && rep.stornoEinbehalt === 0) continue;
      await this.repRepo.increment({ id: rep.repId }, 'negativsaldo', rep.negativsaldoDelta);
      await this.repRepo.increment({ id: rep.repId }, 'stornoKontoSaldo', rep.stornoEinbehalt);
      if (rep.negativsaldoDelta > 0) {
        await this.ledger.appendFinancial({
          monat: run.periode, typ: 'negativsaldo_vorschuss', betrag: rep.negativsaldoDelta,
          quelle: 'run', akteur: userId, begruendung: `Provisionslauf ${run.id}`,
        });
      }
      if (rep.stornoEinbehalt > 0) {
        await this.ledger.appendFinancial({
          monat: run.periode, typ: 'storno_einbehalt', betrag: rep.stornoEinbehalt,
          quelle: 'run', akteur: userId, begruendung: `Provisionslauf ${run.id}`,
        });
      }
    }
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

  // -- internals -------------------------------------------------------------

  private async compute(run: CommissionRun): Promise<FachkonzeptRunResult> {
    const asOf = this.periodEnd(run.periode);
    const config = await this.resolveConfig(asOf);

    const reps = await this.repRepo.find({ relations: ['organisation'] });
    const runReps: RunRep[] = reps.map((r) => ({
      id: r.id,
      isPartner: r.organisation?.orgTyp === OrgType.Partner,
      trainerId: r.trainerId,
      teamleadId: r.teamleadId,
      negativsaldo: Number(r.negativsaldo ?? 0),
    }));

    const where = run.organisationId ? { organisationId: run.organisationId } : {};
    const allContracts = await this.contractRepo.find({ where });
    const contracts: RunContract[] = allContracts
      .filter((ct) => (ct.erfassungsdatum ?? '').startsWith(run.periode))
      .map((ct) => {
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
          kreditcheckConfirmed: !!ct.kreditcheckDatum,
          lieferbeginnConfirmed: !!ct.lieferbeginn,
        };
      });

    return computeFachkonzeptRun({ periode: run.periode, config, reps: runReps, contracts });
  }

  private periodEnd(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  private async resolveConfig(asOf: string): Promise<FachkonzeptRunConfig> {
    const g = async <T>(key: ConfigKey) => (await this.config.resolve<T>(key, asOf)) as T;
    return {
      qualifyingStatuses: await g<string[]>(ConfigKey.QualifyingStatuses),
      minConsumptionStrom: await g<number>(ConfigKey.MinConsumptionStrom),
      minConsumptionGas: await g<number>(ConfigKey.MinConsumptionGas),
      employeeTier: await g<Tier[]>(ConfigKey.EmployeeTier),
      partnerTier: await g<Tier[]>(ConfigKey.PartnerTier),
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
