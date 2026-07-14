import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigKey, TariffEnergyType, Tier } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { CommercialReserve } from '../entities/commercial-reserve.entity';
import { BusinessConfigService } from '../config-store/business-config.service';
import { FachkonzeptRunService } from '../commissions/fachkonzept/fachkonzept-run.service';
import { RepSummary } from '../commissions/fachkonzept/fachkonzept-run';
import { swaTierLevel } from '../commissions/fachkonzept/fachkonzept-engine';
import {
  computeWarnings,
  warningCounts,
  Warning,
  WarnContract,
  WarnRep,
  WarnReserve,
} from './warnings';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export interface WarningsResult {
  periode: string;
  counts: ReturnType<typeof warningCounts>;
  warnings: Warning[];
}

/**
 * Loads the live data for the ch. 13 warning & check system (I-35) and runs the
 * pure rule set (`warnings.ts`). It reuses the exact run computation (preview) so
 * the per-contract payout and per-rep tier progress it flags match the booking
 * logic, and reads the persisted commercial reserves for the under-funding
 * check.
 */
@Injectable()
export class WarningsService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(Organisation) private readonly orgRepo: Repository<Organisation>,
    @InjectRepository(CommercialReserve) private readonly reserveRepo: Repository<CommercialReserve>,
    private readonly config: BusinessConfigService,
    private readonly runService: FachkonzeptRunService,
  ) {}

  private static currentPeriode(): string {
    return new Date().toISOString().slice(0, 7);
  }

  async warnings(periode?: string): Promise<WarningsResult> {
    const p = periode && PERIODE_RE.test(periode) ? periode : WarningsService.currentPeriode();
    const asOf = this.periodEnd(p);
    const today = new Date().toISOString().slice(0, 10);

    const preview = await this.runService.preview(p).catch(() => null);
    const [contracts, reps, orgs, reserves] = await Promise.all([
      this.contractRepo.find(),
      this.repRepo.find({ relations: ['organisation'] }),
      this.orgRepo.find(),
      this.reserveRepo.find(),
    ]);

    const repIds = new Set(reps.map((r) => r.id));
    const orgIds = new Set(orgs.map((o) => o.id));

    // Per-contract due payout and plausibility from the live preview.
    const payoutByContract = new Map<string, number>();
    const plausByContract = new Map<string, string>();
    if (preview) {
      for (const l of preview.lines) {
        if (l.faellig) payoutByContract.set(l.contractId, (payoutByContract.get(l.contractId) ?? 0) + Number(l.betrag));
      }
      for (const pl of preview.plausibilities) plausByContract.set(pl.contractId, pl.status);
    }

    const warnContracts: WarnContract[] = contracts.map((ct) => {
      const isGas = ct.tariffEnergyType === TariffEnergyType.Gas;
      const surcharge = isGas ? ct.rateExtraProfitProvisionGp : ct.rateExtraProfitProvision;
      return {
        id: ct.id,
        swaOrderNumber: ct.swaOrderNumber ?? null,
        kunde: ct.kunde ?? null,
        repId: ct.repId ?? null,
        repBekannt: !!ct.repId && repIds.has(ct.repId),
        organisationId: ct.organisationId ?? null,
        orgBekannt: !!ct.organisationId && orgIds.has(ct.organisationId),
        energie: ct.tariffEnergyType ?? null,
        surchargeCt: num(surcharge),
        auszahlung: payoutByContract.has(ct.id) ? Math.round((payoutByContract.get(ct.id)! + Number.EPSILON) * 100) / 100 : null,
        swaRevenue: num(ct.swaZahlbetrag),
        plausibilitaetStatus: plausByContract.get(ct.id) ?? ct.plausibilitaetStatus ?? null,
        stornoDatum: ct.stornoDatum ?? null,
        // Retention due date / lead-time contact date are not separately stored
        // yet; the pure rules handle them when present (unit-tested).
        retentionFaelligAm: null,
        leadTimeKontaktAb: null,
      };
    });

    // Per-rep tier progress from the preview summary + the tier config.
    const employeeTier = ((await this.config.resolve<Tier[]>(ConfigKey.EmployeeTier, asOf)) ?? []) as Tier[];
    const partnerTier = ((await this.config.resolve<Tier[]>(ConfigKey.PartnerTier, asOf)) ?? []) as Tier[];
    const summaryByRep = new Map<string, RepSummary>((preview?.repSummaries ?? []).map((r) => [r.repId, r]));
    const warnReps: WarnRep[] = reps.map((r) => {
      const s = summaryByRep.get(r.id);
      const count = s?.qualifiedNewCount ?? 0;
      const tiers = s?.isPartner ? partnerTier : employeeTier;
      const level = swaTierLevel(count, tiers);
      return {
        id: r.id,
        name: r.name,
        negativsaldo: Number(r.negativsaldo ?? 0),
        qualifiedNewCount: count,
        bisNaechsteStufe: level.nextThreshold != null ? level.nextThreshold - count : null,
      };
    });

    const warnReserves: WarnReserve[] = reserves
      .filter((r) => !r.freigegebenAm)
      .map((r) => ({
        contractId: r.contractId,
        repId: r.repId,
        reserveTarget: Number(r.reserveTarget),
        reserveActual: Number(r.reserveActual),
      }));

    const capStrom = (await this.config.resolve<number>(ConfigKey.CommercialSurchargeCapStrom, asOf)) ?? 4;
    const capGas = (await this.config.resolve<number>(ConfigKey.CommercialSurchargeCapGas, asOf)) ?? 2;
    const stornoProtectionMonths = (await this.config.resolve<number>(ConfigKey.StornoProtectionMonths, asOf)) ?? 6;

    const warnings = computeWarnings({
      today,
      contracts: warnContracts,
      reps: warnReps,
      reserves: warnReserves,
      config: {
        capStrom,
        capGas,
        stornoProtectionMonths,
        swaReachedTierRate: preview?.swaTier.erreichteStufe ?? null,
        swaControlTierRate: null,
      },
    });

    return { periode: p, counts: warningCounts(warnings), warnings };
  }

  private periodEnd(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }
}
