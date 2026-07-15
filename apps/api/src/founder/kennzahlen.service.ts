import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientType, CollectionsStatus, ConfigKey, OrgType } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { BusinessConfigService } from '../config-store/business-config.service';
import { FachkonzeptRunService } from '../commissions/fachkonzept/fachkonzept-run.service';
import { FachkonzeptRunResult } from '../commissions/fachkonzept/fachkonzept-run';
import { StornoAccountService } from '../posting-objects/storno-account.service';
import { CommercialReserveService } from '../posting-objects/commercial-reserve.service';
import { ClawbackService } from '../posting-objects/clawback.service';
import { WarningsService } from '../warnings/warnings.service';
import { DataQualityService } from '../ingestion/data-quality.service';
import { ForecastService } from '../forecast/forecast.service';
import {
  computeFreeLiquidity,
  rollupCommercial,
  rollupEmployees,
  rollupPartners,
  CommercialTile,
  EmployeeTile,
  LiquidityResult,
  PartnerTile,
  RepRollupLine,
} from './kennzahlen';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => (v == null ? 0 : Number(v));

/** The full Founder KPI payload (I-27, ch. 11.1) — every euro amount is net (I-29). */
export interface FounderKpis {
  periode: string;
  /** all management figures are net; salary tiles are explicitly gross-salary. */
  nettoHinweis: string;
  swaUmsatz: {
    aktuellBestaetigt: number;
    aktuellErwartet: number;
    vormonatBestaetigt: number;
    ytdBestaetigt: number;
    ytdErwartet: number;
  };
  neukundenTier: {
    qualifizierteNeukunden: number;
    erreichteStufe: number;
    naechsteStufeAb: number | null;
    naechsteStufeSatz: number | null;
    anzahlAbweichung: number;
    anzahlOffen: number;
  };
  angestellte: EmployeeTile;
  partner: PartnerTile;
  gewerbe: CommercialTile & { ersteHaelfteBestaetigt: number; zweiteHaelfteBestaetigt: number };
  freieBetriebsliquiditaet: LiquidityResult;
  warnungen: { rot: number; gelb: number; info: number };
  datenqualitaet: { gesperrteVertraege: number; offeneFehler: number };
  /** I-30 real-time: live tier progress + immediate reversal impact. */
  echtzeit: {
    provisorisch: true;
    reversalImpactGesamt: number;
    anzahlReversals: number;
    repTierProjektionen: Awaited<ReturnType<ForecastService['forecast']>>['repTierProjektionen'];
  };
}

/**
 * Assembles the Founder dashboard KPI tiles (I-27, Fachkonzept ch. 11.1), all
 * **net** (I-29), including the **free operating liquidity** figure and the
 * live real-time projection (I-30, reusing the forecast). It reuses the exact run
 * computation (`FachkonzeptRunService.preview`) so the tiles never diverge from
 * the eventual booking, and reads the persisted posting objects (storno account,
 * commercial reserve, clawbacks) for the liability side of liquidity.
 */
@Injectable()
export class KennzahlenService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    private readonly config: BusinessConfigService,
    private readonly runService: FachkonzeptRunService,
    private readonly storno: StornoAccountService,
    private readonly reserves: CommercialReserveService,
    private readonly clawbacks: ClawbackService,
    private readonly warnings: WarningsService,
    private readonly dataQuality: DataQualityService,
    private readonly forecast: ForecastService,
  ) {}

  private static currentPeriode(): string {
    return new Date().toISOString().slice(0, 7);
  }

  private periodEnd(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  private priorPeriode(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  }

  async kennzahlen(periode?: string): Promise<FounderKpis> {
    const p = periode || KennzahlenService.currentPeriode();
    if (!PERIODE_RE.test(p)) {
      throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
    }
    const asOf = this.periodEnd(p);

    const [preview, priorPreview, ytd, stornoTotal, reserveSummary, clawbackRows, warn, dq, forecast, fixum, employerCostRate] =
      await Promise.all([
        this.runService.preview(p).catch(() => null),
        this.runService.preview(this.priorPeriode(p)).catch(() => null),
        this.ytdConfirmed(p),
        this.storno.total(),
        this.reserves.summary(),
        this.clawbacks.findAll(),
        this.warnings.warnings(p).catch(() => null),
        this.dataQuality.overview().catch(() => null),
        this.forecast.forecast(p).catch(() => null),
        this.config.resolve<number>(ConfigKey.Fixum, asOf),
        this.config.resolve<number>(ConfigKey.EmployerCostRate, asOf),
      ]);

    const [reps, contracts] = await Promise.all([
      this.repRepo.find({ relations: ['organisation'] }),
      this.contractRepo.find(),
    ]);

    const partnerRepIds = new Set(reps.filter((r) => r.organisation?.orgTyp === OrgType.Partner).map((r) => r.id));

    const repLines: RepRollupLine[] = (preview?.repSummaries ?? []).map((r) => ({
      repId: r.repId,
      isPartner: r.isPartner,
      variableProvision: r.variableProvision,
      auszahlung: r.auszahlung,
      negativsaldoAfter: r.negativsaldoAfter,
      stornoEinbehalt: r.stornoEinbehalt,
    }));

    const angestellte = rollupEmployees(repLines, {
      fixum: num(fixum),
      employerCostRate: num(employerCostRate),
    });

    // Partner confirmed SWA revenue: actual SWA commission on contracts booked to
    // a partner-org rep in this period (drives the BlitzON margin tile).
    const periodContracts = contracts.filter((ct) => (ct.erfassungsdatum ?? '').startsWith(p));
    const bestaetigterSwaUmsatzPartner = round2(
      periodContracts
        .filter((ct) => ct.repId && partnerRepIds.has(ct.repId))
        .reduce((s, ct) => s + num(ct.tatsaechlicheSwaProvision), 0),
    );
    const offeneRuecklagePartner = this.openRetention(preview, partnerRepIds, true);
    const partner = rollupPartners(repLines, { offeneRuecklage: offeneRuecklagePartner, bestaetigterSwaUmsatzPartner });

    const commercialAgg = this.commercialAggregate(preview, reserveSummary);
    const commercialContracts = periodContracts.filter((ct) => ct.clientType === ClientType.Gewerbe);
    const gewerbe = {
      ...rollupCommercial(commercialAgg),
      ersteHaelfteBestaetigt: commercialContracts.filter((ct) => !!ct.kreditcheckDatum).length,
      zweiteHaelfteBestaetigt: commercialContracts.filter((ct) => !!ct.lieferbeginn).length,
    };

    const offeneClawbackForderungen = round2(
      clawbackRows
        .filter((c) => c.inkassoStatus !== CollectionsStatus.Ausgeglichen)
        .reduce((s, c) => s + num(c.remaining), 0),
    );

    const freieBetriebsliquiditaet = computeFreeLiquidity({
      bestaetigterSwaUmsatz: num(preview?.swaTier.tatsaechlichGesamt),
      faelligeAuszahlungen: num(preview?.totals.faelligGesamt),
      arbeitgeberkosten: angestellte.arbeitgeberkosten,
      stornoKontoReserviert: num(stornoTotal.gesamtsaldo),
      gebundeneGewerbeRuecklage: num(reserveSummary.total.offen),
      offeneClawbackForderungen,
    });

    return {
      periode: p,
      nettoHinweis:
        'Alle Management-Kennzahlen sind Nettobeträge (Fachkonzept 2). „Bruttogehalt" ist eine Lohn-/Gehaltsgröße, kein Umsatzsteuer-Bruttobetrag.',
      swaUmsatz: {
        aktuellBestaetigt: num(preview?.swaTier.tatsaechlichGesamt),
        aktuellErwartet: num(preview?.swaTier.erwartetGesamt),
        vormonatBestaetigt: num(priorPreview?.swaTier.tatsaechlichGesamt),
        ytdBestaetigt: ytd.bestaetigt,
        ytdErwartet: ytd.erwartet,
      },
      neukundenTier: {
        qualifizierteNeukunden: num(preview?.swaTier.qualifizierteNeukunden),
        erreichteStufe: num(preview?.swaTier.erreichteStufe),
        naechsteStufeAb: preview?.swaTier.naechsteStufeAb ?? null,
        naechsteStufeSatz: preview?.swaTier.naechsteStufeSatz ?? null,
        anzahlAbweichung: num(preview?.swaTier.anzahlAbweichung),
        anzahlOffen: num(preview?.swaTier.anzahlOffen),
      },
      angestellte,
      partner,
      gewerbe,
      freieBetriebsliquiditaet,
      warnungen: {
        rot: warn?.counts.rot ?? 0,
        gelb: warn?.counts.gelb ?? 0,
        info: warn?.counts.info ?? 0,
      },
      datenqualitaet: {
        gesperrteVertraege: dq?.gesperrteVertraege ?? 0,
        offeneFehler: dq?.offeneFehler ?? 0,
      },
      echtzeit: {
        provisorisch: true,
        reversalImpactGesamt: num(forecast?.reversalImpactGesamt),
        anzahlReversals: forecast?.reversals.length ?? 0,
        repTierProjektionen: forecast?.repTierProjektionen ?? [],
      },
    };
  }

  /**
   * Export the KPI tiles as a flat CSV (I-37, ch. 18 export readiness). The
   * run-level accounting/Excel/PDF exporters remain the per-contract export path;
   * this is the dashboard-level KPI snapshot, net throughout.
   */
  async exportCsv(periode?: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const k = await this.kennzahlen(periode);
    const rows: [string, string, number | string][] = [
      ['SWA-Umsatz', 'Aktuell bestätigt (netto)', k.swaUmsatz.aktuellBestaetigt],
      ['SWA-Umsatz', 'Aktuell erwartet (netto)', k.swaUmsatz.aktuellErwartet],
      ['SWA-Umsatz', 'Vormonat bestätigt (netto)', k.swaUmsatz.vormonatBestaetigt],
      ['SWA-Umsatz', 'YTD bestätigt (netto)', k.swaUmsatz.ytdBestaetigt],
      ['SWA-Umsatz', 'YTD erwartet (netto)', k.swaUmsatz.ytdErwartet],
      ['Neukunden/Staffel', 'Qualifizierte Neukunden', k.neukundenTier.qualifizierteNeukunden],
      ['Neukunden/Staffel', 'Erreichte SWA-Stufe', k.neukundenTier.erreichteStufe],
      ['Neukunden/Staffel', 'Abweichungen', k.neukundenTier.anzahlAbweichung],
      ['Angestellte', 'Provision netto', k.angestellte.provision],
      ['Angestellte', 'Netto-Auszahlung', k.angestellte.nettoAuszahlung],
      ['Angestellte', 'Bruttogehalt-Basis (Lohn)', k.angestellte.bruttoGehaltBasis],
      ['Angestellte', 'Negativsaldo gesamt', k.angestellte.negativsaldoGesamt],
      ['Angestellte', 'Arbeitgeberkosten', k.angestellte.arbeitgeberkosten],
      ['Angestellte', 'Storno-Einbehalt', k.angestellte.stornoEinbehalt],
      ['Angestellte', 'Deckungsbeitrag netto', k.angestellte.deckungsbeitrag],
      ['Partner', 'Umsatz netto', k.partner.umsatz],
      ['Partner', 'Netto-Auszahlung', k.partner.nettoAuszahlung],
      ['Partner', 'Offene Rücklage', k.partner.offeneRuecklage],
      ['Partner', 'BlitzON-Marge netto', k.partner.blitzonMarge],
      ['Gewerbe', 'Gesamtprovision netto', k.gewerbe.gesamtProvision],
      ['Gewerbe', 'Sofortanteil (fällig)', k.gewerbe.sofortAnteil],
      ['Gewerbe', 'Rücklageanteil (nicht fällig)', k.gewerbe.ruecklageAnteil],
      ['Gewerbe', 'Reserve Soll', k.gewerbe.reserveTarget],
      ['Gewerbe', 'Reserve Ist', k.gewerbe.reserveActual],
      ['Gewerbe', 'Unterdeckung', k.gewerbe.unterdeckung],
      ['Gewerbe', '1. SWA-Hälfte bestätigt', k.gewerbe.ersteHaelfteBestaetigt],
      ['Gewerbe', '2. SWA-Hälfte bestätigt', k.gewerbe.zweiteHaelfteBestaetigt],
      ['Liquidität', 'Freie Betriebsliquidität netto', k.freieBetriebsliquiditaet.wert],
      ['Liquidität', '  + Bestätigter SWA-Umsatz', k.freieBetriebsliquiditaet.komponenten.bestaetigterSwaUmsatz],
      ['Liquidität', '  − Fällige Auszahlungen', k.freieBetriebsliquiditaet.komponenten.faelligeAuszahlungen],
      ['Liquidität', '  − Arbeitgeberkosten', k.freieBetriebsliquiditaet.komponenten.arbeitgeberkosten],
      ['Liquidität', '  − Storno-Konto reserviert', k.freieBetriebsliquiditaet.komponenten.stornoKontoReserviert],
      ['Liquidität', '  − Gebundene Gewerberücklage', k.freieBetriebsliquiditaet.komponenten.gebundeneGewerbeRuecklage],
      ['Liquidität', '  − Offene Clawback-Forderungen', k.freieBetriebsliquiditaet.komponenten.offeneClawbackForderungen],
      ['Warnungen', 'Rot', k.warnungen.rot],
      ['Warnungen', 'Gelb', k.warnungen.gelb],
      ['Warnungen', 'Info', k.warnungen.info],
      ['Datenqualität', 'Gesperrte Verträge', k.datenqualitaet.gesperrteVertraege],
      ['Datenqualität', 'Offene Fehler', k.datenqualitaet.offeneFehler],
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
      `# BlitzON Kennzahlen ${k.periode} — alle Beträge netto (Fachkonzept 2/18)`,
      ['Bereich', 'Kennzahl', 'Wert'].map(esc).join(';'),
      ...rows.map((r) => r.map(esc).join(';')),
    ];
    const buffer = Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
    return { filename: `kennzahlen-${k.periode}.csv`, buffer, contentType: 'text/csv; charset=utf-8' };
  }

  /** Sum of the non-due commercial retention lines, optionally partner-only. */
  private openRetention(
    preview: FachkonzeptRunResult | null,
    partnerRepIds: Set<string>,
    partnerOnly: boolean,
  ): number {
    if (!preview) return 0;
    return round2(
      preview.lines
        .filter((l) => l.kategorie === 'gewerbe_ruecklage')
        .filter((l) => (partnerOnly ? !!l.repId && partnerRepIds.has(l.repId) : true))
        .reduce((s, l) => s + l.betrag, 0),
    );
  }

  private commercialAggregate(
    preview: FachkonzeptRunResult | null,
    reserveSummary: Awaited<ReturnType<CommercialReserveService['summary']>>,
  ) {
    const lines = preview?.lines ?? [];
    const sofort = lines.filter((l) => l.kategorie === 'gewerbe_sofort');
    const ruecklage = lines.filter((l) => l.kategorie === 'gewerbe_ruecklage');
    const sofortAnteil = round2(sofort.reduce((s, l) => s + l.betrag, 0));
    const ruecklageAnteil = round2(ruecklage.reduce((s, l) => s + l.betrag, 0));
    const risiken = sofort.filter((l) => l.datencheck).length + (reserveSummary.total.unterdeckt > 0 ? 1 : 0);
    return {
      anzahl: new Set(sofort.map((l) => l.contractId)).size,
      gesamtProvision: round2(sofortAnteil + ruecklageAnteil),
      sofortAnteil,
      ruecklageAnteil,
      reserveTarget: reserveSummary.total.reserveTarget,
      reserveActual: reserveSummary.total.reserveActual,
      unterdeckung: reserveSummary.total.unterdeckt,
      risiken,
    };
  }

  /** Year-to-date confirmed vs. expected SWA commission (Jan..periode, same year). */
  private async ytdConfirmed(periode: string): Promise<{ bestaetigt: number; erwartet: number }> {
    const [y, m] = periode.split('-').map(Number);
    const months = Array.from({ length: m }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
    const previews = await Promise.all(months.map((mm) => this.runService.preview(mm).catch(() => null)));
    return {
      bestaetigt: round2(previews.reduce((s, pr) => s + num(pr?.swaTier.tatsaechlichGesamt), 0)),
      erwartet: round2(previews.reduce((s, pr) => s + num(pr?.swaTier.erwartetGesamt), 0)),
    };
  }
}
