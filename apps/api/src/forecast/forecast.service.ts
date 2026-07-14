import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CLAWBACK_STATUS, ConfigKey, Tier } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { BusinessConfigService } from '../config-store/business-config.service';
import { FachkonzeptRunService } from '../commissions/fachkonzept/fachkonzept-run.service';
import {
  projectRepTier,
  projectReversals,
  RepTierProjection,
  ReversalWarning,
} from './forecast';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** The provisional projection returned by the forecast endpoint (I-16). */
export interface ForecastResult {
  periode: string;
  /** Always true — nothing here is payable until the SWA list confirms it. */
  provisorisch: true;
  erstelltAm: string;
  hinweis: string;
  /** company-wide SWA new-customer tier roll-up incl. next threshold. */
  swaTier: Awaited<ReturnType<FachkonzeptRunService['preview']>>['swaTier'];
  /** per-rep live tier progress + next-threshold potential (retroactive switch). */
  repTierProjektionen: RepTierProjection[];
  /** per-rep salary/storno summary from the same computation as a real run. */
  repSummaries: Awaited<ReturnType<FachkonzeptRunService['preview']>>['repSummaries'];
  totals: Awaited<ReturnType<FachkonzeptRunService['preview']>>['totals'];
  /** reversals / late status changes as warnings with financial impact. */
  reversals: ReversalWarning[];
  reversalImpactGesamt: number;
  warnungen: string[];
}

/**
 * Live forecast / preview service (I-16, Fachkonzept ch. 11.3).
 *
 * Reuses the exact run computation (`FachkonzeptRunService.preview`, no
 * persistence) so the provisional projection can never diverge from the eventual
 * booking, then layers the per-rep tier projection (incl. the retroactive switch
 * and the next-threshold potential) and the reversal warnings on top. Everything
 * is explicitly marked provisional.
 */
@Injectable()
export class ForecastService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    private readonly config: BusinessConfigService,
    private readonly runService: FachkonzeptRunService,
  ) {}

  private currentPeriode(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private periodEnd(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  async forecast(periode?: string, organisationId?: string | null): Promise<ForecastResult> {
    const p = periode || this.currentPeriode();
    if (!PERIODE_RE.test(p)) {
      throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
    }
    const asOf = this.periodEnd(p);
    const [employeeTier, partnerTier, run] = await Promise.all([
      this.config.resolve<Tier[]>(ConfigKey.EmployeeTier, asOf),
      this.config.resolve<Tier[]>(ConfigKey.PartnerTier, asOf),
      this.runService.preview(p, organisationId ?? null),
    ]);

    const repTierProjektionen = run.repSummaries.map((r) =>
      projectRepTier(
        r.repId,
        r.isPartner,
        r.qualifiedNewCount,
        r.variableProvision,
        (r.isPartner ? partnerTier : employeeTier) ?? [],
      ),
    );

    // Reversals / late status changes (Storno/Widerruf) in the period. These
    // arrived after the last sync and reduce the provisional projection; their
    // financial impact is the SWA commission at risk of being clawed back.
    const clawbackStatuses = new Set<string>([...CLAWBACK_STATUS].map(String));
    const contracts = await this.contractRepo.find({
      where: organisationId ? { organisationId } : {},
    });
    const reversalInputs = contracts
      .filter((ct) => (ct.erfassungsdatum ?? '').startsWith(p))
      .filter((ct) => clawbackStatuses.has(ct.status))
      .map((ct) => ({
        contractId: ct.id,
        swaOrderNumber: ct.swaOrderNumber,
        kunde: ct.kunde,
        repId: ct.repId,
        status: ct.status,
        betrag: num(ct.tatsaechlicheSwaProvision) || num(ct.erwarteteSwaProvision) || num(ct.swaGesamtprovision),
      }));
    const { warnings, impactGesamt } = projectReversals(reversalInputs);

    const warnungen = [...run.warnungen];
    if (warnings.length > 0) {
      warnungen.push(
        `${warnings.length} Vertrag/Verträge mit Storno/Widerruf seit dem letzten Sync — Auswirkung € ${impactGesamt.toFixed(2)} (vorläufig).`,
      );
    }

    return {
      periode: p,
      provisorisch: true,
      erstelltAm: new Date().toISOString(),
      hinweis:
        'Vorläufige Projektion aus Live-Daten. Nichts ist zahlbar, bevor die SWA-Abrechnungsliste die Werte bestätigt (Fachkonzept 11.3).',
      swaTier: run.swaTier,
      repTierProjektionen,
      repSummaries: run.repSummaries,
      totals: run.totals,
      reversals: warnings,
      reversalImpactGesamt: impactGesamt,
      warnungen,
    };
  }
}
