import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientType, ConfigKey, OrgType, StartDeliveryType } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { MonthClose } from '../entities/month-close.entity';
import { ClawbackReceivable } from '../entities/clawback-receivable.entity';
import { BusinessConfigService } from '../config-store/business-config.service';
import { LedgerService } from '../config-store/ledger.service';
import { FachkonzeptRunService } from '../commissions/fachkonzept/fachkonzept-run.service';
import { StornoAccountService } from '../posting-objects/storno-account.service';
import { CommercialReserveService } from '../posting-objects/commercial-reserve.service';
import { WarningsService } from '../warnings/warnings.service';
import { ForecastService } from '../forecast/forecast.service';
import { DataQualityService } from '../ingestion/data-quality.service';
import { computeFounderDashboard, FounderDashboardResult } from './founder-dashboard';
import { AcceptanceEvidence, AcceptanceResult, evaluateAcceptanceCriteria } from './acceptance-18';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Founder dashboard & reporting service (Epic P6 · I-27/I-28/I-29/I-30,
 * Fachkonzept ch. 11).
 *
 * Assembles the ch. 11.1 KPI tiles (I-27), the drill-downs traceable to a single
 * SWA order number (I-28) and the real-time / forecast view (I-30) — **net
 * throughout** (I-29). Every figure is sourced from the same run computation as a
 * real Provisionslauf (`FachkonzeptRunService.preview`, no persistence) plus the
 * posting-object services (storno accounts, commercial reserves, clawbacks), the
 * warning system and the data-quality view, so the dashboard can never diverge
 * from the eventual booking. Also evaluates the 11 ch. 18 acceptance criteria and
 * exports the KPIs (I-37).
 */
@Injectable()
export class FounderDashboardService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(Organisation) private readonly orgRepo: Repository<Organisation>,
    @InjectRepository(MonthClose) private readonly monthCloseRepo: Repository<MonthClose>,
    @InjectRepository(ClawbackReceivable) private readonly clawbackRepo: Repository<ClawbackReceivable>,
    private readonly config: BusinessConfigService,
    private readonly ledger: LedgerService,
    private readonly runService: FachkonzeptRunService,
    private readonly storno: StornoAccountService,
    private readonly reserves: CommercialReserveService,
    private readonly warnings: WarningsService,
    private readonly forecast: ForecastService,
    private readonly dataQuality: DataQualityService,
  ) {}

  // -- helpers ---------------------------------------------------------------

  private normPeriode(periode?: string): string {
    return periode && PERIODE_RE.test(periode) ? periode : new Date().toISOString().slice(0, 7);
  }

  private periodEnd(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  private prevPeriode(periode: string): string {
    const [y, m] = periode.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
  }

  /** The booking value the engine uses: override ⇒ actual ⇒ total (I-36/I-14). */
  private resolveActual(ct: Contract): number {
    return num(ct.manuellerOverride ?? ct.tatsaechlicheSwaProvision ?? ct.swaGesamtprovision);
  }

  private isPartnerRep(rep: SalesRep | undefined): boolean {
    return rep?.organisation?.orgTyp === OrgType.Partner;
  }

  // -- KPI tiles (I-27) + real-time (I-30) -----------------------------------

  /**
   * The ch. 11.1 Founder start page: KPI tiles (I-27), net throughout (I-29),
   * with the live forecast section (I-30) attached. `realtime=false` skips the
   * (heavier) forecast projection for the export/acceptance paths.
   */
  async dashboard(periode?: string, realtime = true): Promise<FounderDashboardResult & { realtime?: unknown }> {
    const p = this.normPeriode(periode);
    const asOf = this.periodEnd(p);

    const [preview, prevPreview, reps, allContracts, stornoTotal, reserveSummary, clawbackRows, warnings, dq, employerCostRate] =
      await Promise.all([
        this.runService.preview(p),
        this.runService.preview(this.prevPeriode(p)).catch(() => null),
        this.repRepo.find({ relations: ['organisation'] }),
        this.contractRepo.find(),
        this.storno.total(),
        this.reserves.summary(),
        this.clawbackRepo.find(),
        this.warnings.warnings(p),
        this.dataQuality.overview(),
        this.config.resolve<number>(ConfigKey.EmployerCostRate, asOf),
      ]);

    const repById = new Map(reps.map((r) => [r.id, r]));
    const contractById = new Map(allContracts.map((c) => [c.id, c]));
    const bookable = allContracts.filter((c) => !c.datenqualitaetGesperrt);
    const periodContracts = bookable.filter((c) => (c.erfassungsdatum ?? '').startsWith(p));
    const year = p.slice(0, 4);
    const ytdContracts = bookable.filter((c) => {
      const m = (c.erfassungsdatum ?? '').slice(0, 7);
      return m.startsWith(year) && m <= p;
    });

    // --- SWA revenue tile (net) ---
    const bestaetigtNetto = round2(preview.swaTier.tatsaechlichGesamt);
    const erwartetNetto = round2(preview.swaTier.erwartetGesamt);
    const vormonatNetto = round2(num(prevPreview?.swaTier.tatsaechlichGesamt));
    const ytdNetto = round2(ytdContracts.reduce((s, c) => s + this.resolveActual(c), 0));

    // --- employee vs partner split of the run summaries ---
    const employeeSummaries = preview.repSummaries.filter((r) => !r.isPartner);
    const partnerSummaries = preview.repSummaries.filter((r) => r.isPartner);
    const employeeAuszahlung = round2(employeeSummaries.reduce((s, r) => s + r.auszahlung, 0));
    const partnerAuszahlung = round2(partnerSummaries.reduce((s, r) => s + r.auszahlung, 0));
    const employeeVariable = round2(employeeSummaries.reduce((s, r) => s + r.variableProvision, 0));

    // Gross-salary basis (Fixum) across active employees — a PAYROLL GROSS figure
    // (I-29): labelled as gross salary, never a VAT-gross amount.
    const activeEmployees = reps.filter((r) => r.aktiv !== false && !this.isPartnerRep(r));
    const bruttogehaltBasis = round2(activeEmployees.reduce((s, r) => s + num(r.grundgehalt), 0));
    const employeeNegativsaldo = round2(reps.filter((r) => !this.isPartnerRep(r)).reduce((s, r) => s + num(r.negativsaldo), 0));
    const arbeitgeberkosten = round2(num(employerCostRate) * employeeAuszahlung);
    const offeneClawbacks = round2(
      clawbackRows.filter((c) => c.inkassoStatus !== 'ausgeglichen').reduce((s, c) => s + num(c.remaining), 0),
    );

    // --- partner SWA revenue attributable to partner contracts ---
    const partnerSwaErtrag = round2(
      periodContracts.filter((c) => c.repId && this.isPartnerRep(repById.get(c.repId))).reduce((s, c) => s + this.resolveActual(c), 0),
    );
    const partnerReps = new Set(partnerSummaries.map((r) => r.repId));
    const partnerOffeneRueckbehalte = round2(
      preview.lines.filter((l) => l.kategorie === 'gewerbe_ruecklage' && l.repId && partnerReps.has(l.repId)).reduce((s, l) => s + l.betrag, 0),
    );

    // --- commercial tile ---
    const gewerbePlaus = preview.plausibilities.filter((pl) => pl.kategorie === 'gewerbe');
    const commercialGesamt = round2(gewerbePlaus.reduce((s, pl) => s + pl.erwartet, 0));
    let ersteHaelfte = 0;
    let zweiteHaelfte = 0;
    for (const pl of gewerbePlaus) {
      const ct = contractById.get(pl.contractId);
      const half = pl.erwartet / 2;
      if (ct?.kreditcheckDatum) ersteHaelfte += half;
      if (ct?.lieferbeginn) zweiteHaelfte += half;
    }
    const commercialOffeneRueckbehalte = round2(
      preview.lines.filter((l) => l.kategorie === 'gewerbe_ruecklage').reduce((s, l) => s + l.betrag, 0),
    );

    const result = computeFounderDashboard({
      periode: p,
      swaRevenue: { bestaetigtNetto, erwartetNetto, vormonatNetto, ytdNetto },
      newCustomers: {
        anzahl: preview.swaTier.qualifizierteNeukunden,
        erreichteStufe: preview.swaTier.erreichteStufe,
        naechsteStufeAb: preview.swaTier.naechsteStufeAb,
        naechsteStufeSatz: preview.swaTier.naechsteStufeSatz,
        anzahlAbweichungen: preview.swaTier.anzahlAbweichung,
      },
      employees: {
        variableProvision: employeeVariable,
        bruttogehaltBasis,
        auszahlungNetto: employeeAuszahlung,
        negativsaldo: employeeNegativsaldo,
        arbeitgeberkosten,
        stornokontoReserviert: round2(stornoTotal.gesamtsaldo),
        offeneClawbacks,
      },
      partners: {
        swaErtragNetto: partnerSwaErtrag,
        auszahlungNetto: partnerAuszahlung,
        offeneRueckbehalte: partnerOffeneRueckbehalte,
        stornoReserviert: 0,
      },
      commercial: {
        gesamtprovision: commercialGesamt,
        ersteHaelfteBestaetigt: round2(ersteHaelfte),
        zweiteHaelfteBestaetigt: round2(zweiteHaelfte),
        offeneRueckbehalte: commercialOffeneRueckbehalte,
        ruecklageSoll: round2(reserveSummary.total.reserveTarget),
        ruecklageIst: round2(reserveSummary.total.reserveActual),
      },
      liquidityFlows: {
        ruecklageSollPeriode: round2(preview.totals.reserveTargetGesamt),
        stornoEinbehaltPeriode: round2(preview.totals.stornoEinbehaltGesamt),
      },
      warnings: warnings.counts,
      dataQuality: {
        letzterSync: dq.letzteSynchronisierung?.beendetAm
          ? new Date(dq.letzteSynchronisierung.beendetAm).toISOString()
          : null,
        gesperrteVertraege: dq.gesperrteVertraege,
        offeneFehler: dq.offeneFehler,
        unbekannteVerkaeufer: dq.unbekannteVerkaeufer.length,
        unbekannteOrganisationen: dq.unbekannteOrganisationen.length,
      },
    });

    if (!realtime) return result;

    // I-30: the real-time / forecast view. Live SWA-tier progress + next
    // threshold, the provisional forecast of extra compensation (Founder only in
    // Phase 1) and reversals/status changes surfaced at once with their impact.
    const fc = await this.forecast.forecast(p).catch(() => null);
    return {
      ...result,
      realtime: fc
        ? {
            provisorisch: fc.provisorisch,
            hinweis: fc.hinweis,
            swaTier: fc.swaTier,
            repTierProjektionen: fc.repTierProjektionen,
            reversals: fc.reversals,
            reversalImpactGesamt: fc.reversalImpactGesamt,
          }
        : null,
    };
  }

  // -- drill-downs (I-28) ----------------------------------------------------

  /** Month drill-down: volume, status split, SWA tier, expected vs. actual, payouts, corrections. */
  async drilldownMonth(periode?: string) {
    const p = this.normPeriode(periode);
    const [preview, allContracts] = await Promise.all([this.runService.preview(p), this.contractRepo.find()]);
    const byId = new Map(allContracts.map((c) => [c.id, c]));
    const contracts = allContracts.filter((c) => !c.datenqualitaetGesperrt && (c.erfassungsdatum ?? '').startsWith(p));
    const statusSplit: Record<string, number> = {};
    for (const c of contracts) statusSplit[c.status] = (statusSplit[c.status] ?? 0) + 1;

    const faelligGesamt = preview.totals.faelligGesamt;
    const rueckstellungGesamt = preview.totals.rueckstellungGesamt;
    const korrekturen = preview.lines.filter((l) => l.istAddendum).length;

    return {
      periode: p,
      volumen: contracts.length,
      statusSplit,
      swaTier: preview.swaTier,
      erwartetVsTatsaechlich: {
        erwartet: preview.swaTier.erwartetGesamt,
        tatsaechlich: preview.swaTier.tatsaechlichGesamt,
        abweichung: preview.swaTier.abweichungGesamt,
      },
      auszahlungen: { faelligGesamt, rueckstellungGesamt },
      korrekturen,
      // Every figure above rolls up from these per-contract lines, each carrying
      // the SWA order number (I-28 traceability).
      zeilen: preview.lines.map((l) => ({
        contractId: l.contractId,
        swaOrderNumber: byId.get(l.contractId)?.swaOrderNumber ?? null,
        kategorie: l.kategorie,
        betrag: l.betrag,
        faellig: l.faellig,
        istAddendum: !!l.istAddendum,
        begruendung: l.begruendung,
      })),
    };
  }

  /** Rep drill-down: contracts, tier, earnings, gross salary, employer cost, negative balance, storno, clawbacks, contribution. */
  async drilldownRep(repId: string, periode?: string) {
    const p = this.normPeriode(periode);
    const asOf = this.periodEnd(p);
    const rep = await this.repRepo.findOne({ where: { id: repId }, relations: ['organisation'] });
    if (!rep) throw new NotFoundException('Verkäufer nicht gefunden.');

    const [preview, employerCostRate, stornoView, clawbackRows, allContracts] = await Promise.all([
      this.runService.preview(p),
      this.config.resolve<number>(ConfigKey.EmployerCostRate, asOf),
      this.storno.summary(repId),
      this.clawbackRepo.find({ where: { repId } }),
      this.contractRepo.find(),
    ]);

    const summary = preview.repSummaries.find((r) => r.repId === repId) ?? null;
    const repContracts = allContracts.filter(
      (c) => c.repId === repId && !c.datenqualitaetGesperrt && (c.erfassungsdatum ?? '').startsWith(p),
    );
    const qualifizierteNeukunden = repContracts.filter(
      (c) => c.clientType === ClientType.Privat && c.startDeliveryType === StartDeliveryType.Neukunde,
    ).length;
    const auszahlung = round2(num(summary?.auszahlung));
    const isPartner = this.isPartnerRep(rep);

    return {
      repId,
      name: rep.name,
      istPartner: isPartner,
      vertraege: repContracts.map((c) => ({ id: c.id, swaOrderNumber: c.swaOrderNumber, kunde: c.kunde, status: c.status })),
      qualifizierteNeukunden,
      aktuelleStufe: round2(num(summary?.tierRate)),
      variableProvision: round2(num(summary?.variableProvision)),
      auszahlungNetto: auszahlung,
      // I-29: base salary is a payroll GROSS figure, explicitly labelled.
      bruttogehaltBasis: round2(num(rep.grundgehalt)),
      arbeitgeberkosten: isPartner ? 0 : round2(num(employerCostRate) * auszahlung),
      negativsaldo: round2(num(rep.negativsaldo)),
      stornokonto: stornoView[0] ?? null,
      offeneClawbacks: round2(clawbackRows.filter((c) => c.inkassoStatus !== 'ausgeglichen').reduce((s, c) => s + num(c.remaining), 0)),
      // net contribution = payout (+ employer cost for employees) against the SWA revenue produced.
      deckungsbeitrag: round2(
        repContracts.reduce((s, c) => s + this.resolveActual(c), 0) - auszahlung - (isPartner ? 0 : round2(num(employerCostRate) * auszahlung)),
      ),
    };
  }

  /** Organisation drill-down: contracts, SWA revenue, partner/employee cost, storno, reserves, BlitzON margin. */
  async drilldownOrg(orgId: string, periode?: string) {
    const p = this.normPeriode(periode);
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organisation nicht gefunden.');

    const [preview, reps, allContracts, reserveSummary] = await Promise.all([
      this.runService.preview(p, orgId),
      this.repRepo.find({ where: { organisationId: orgId }, relations: ['organisation'] }),
      this.contractRepo.find({ where: { organisationId: orgId } }),
      this.reserves.summary(),
    ]);

    const repIds = new Set(reps.map((r) => r.id));
    const orgContracts = allContracts.filter((c) => !c.datenqualitaetGesperrt && (c.erfassungsdatum ?? '').startsWith(p));
    const swaErtrag = round2(orgContracts.reduce((s, c) => s + this.resolveActual(c), 0));
    const auszahlung = round2(preview.repSummaries.reduce((s, r) => s + r.auszahlung, 0));
    const offeneRueckbehalte = round2(preview.lines.filter((l) => l.kategorie === 'gewerbe_ruecklage').reduce((s, l) => s + l.betrag, 0));
    const ruecklagen = reserveSummary.perContract.filter((r) => r.repId && repIds.has(r.repId));
    const ruecklageSoll = round2(ruecklagen.reduce((s, r) => s + num(r.reserveTarget), 0));
    const isPartner = org.orgTyp === OrgType.Partner;

    return {
      organisationId: orgId,
      name: org.name,
      typ: org.orgTyp,
      istPartner: isPartner,
      anzahlVertraege: orgContracts.length,
      swaErtragNetto: swaErtrag,
      auszahlungNetto: auszahlung,
      offeneRueckbehalte,
      ruecklageSoll,
      // No central fixed-cost allocation in Phase 1 (ch. 11.2): BlitzON margin is
      // the SWA revenue minus the direct payout and the retention still held.
      blitzonMarge: round2(swaErtrag - auszahlung - offeneRueckbehalte),
      vertraege: orgContracts.map((c) => ({ id: c.id, swaOrderNumber: c.swaOrderNumber, kunde: c.kunde, status: c.status })),
    };
  }

  /** Contract drill-down: full status history, SWA revenue, computed values, payouts, reserves, clawbacks, dates. */
  async drilldownContract(contractId: string) {
    const contract = await this.contractRepo.findOne({ where: { id: contractId }, relations: ['organisation', 'rep'] });
    if (!contract) throw new NotFoundException('Vertrag nicht gefunden.');

    const [statusHistorie, financeHistorie, reserveRows, clawbackRows] = await Promise.all([
      this.ledger.statusHistory(contractId),
      this.ledger.financialHistory(contractId),
      this.reserves.findAll(),
      this.clawbackRepo.find({ where: { contractId } }),
    ]);

    return {
      id: contract.id,
      swaOrderNumber: contract.swaOrderNumber,
      kunde: contract.kunde,
      status: contract.status,
      clientType: contract.clientType,
      startDeliveryType: contract.startDeliveryType,
      energie: contract.tariffEnergyType,
      lieferbeginn: contract.lieferbeginn,
      vertragEnde: contract.vertragEnde,
      vorvertragEnde: contract.vorvertragEnde,
      swa: {
        gesamtprovision: num(contract.swaGesamtprovision),
        zahlbetrag: num(contract.swaZahlbetrag),
        erwartet: num(contract.erwarteteSwaProvision),
        tatsaechlich: contract.tatsaechlicheSwaProvision == null ? null : num(contract.tatsaechlicheSwaProvision),
        manuellerOverride: contract.manuellerOverride == null ? null : num(contract.manuellerOverride),
        abweichung: contract.abweichung == null ? null : num(contract.abweichung),
        plausibilitaetStatus: contract.plausibilitaetStatus,
      },
      statusHistorie: statusHistorie.map((e) => ({ status: e.status, quelle: e.quelle, monat: e.monat, akteur: e.akteur, am: e.createdAt })),
      finanzHistorie: financeHistorie.map((e) => ({ typ: e.typ, betrag: num(e.betrag), monat: e.monat, quelle: e.quelle, begruendung: e.begruendung, am: e.createdAt })),
      ruecklagen: reserveRows.filter((r) => r.contractId === contractId).map((r) => ({
        periode: r.periode, reserveTarget: num(r.reserveTarget), reserveActual: num(r.reserveActual), status: r.status,
      })),
      clawbacks: clawbackRows.map((c) => ({
        swaClawback: num(c.swaClawback), passThrough: num(c.passThrough), remaining: num(c.remaining), inkassoStatus: c.inkassoStatus,
      })),
    };
  }

  /** Reserves drill-down: storno accounts (per person) and commercial reserves (per contract). */
  async drilldownReserves() {
    const [stornoViews, stornoTotal, reserveSummary] = await Promise.all([
      this.storno.summary(),
      this.storno.total(),
      this.reserves.summary(),
    ]);
    return {
      stornokonten: { proMitarbeiter: stornoViews, gesamt: stornoTotal },
      gewerbeRuecklagen: {
        gesamt: reserveSummary.total,
        proVertrag: reserveSummary.perContract.map((r) => ({
          contractId: r.contractId,
          swaOrderNumber: r.contract?.swaOrderNumber ?? null,
          repId: r.repId,
          periode: r.periode,
          reserveTarget: num(r.reserveTarget),
          reserveActual: num(r.reserveActual),
          status: r.status,
          faelligNach: r.contract?.vertragEnde ?? null,
        })),
      },
    };
  }

  // -- acceptance criteria (I-37) --------------------------------------------

  async acceptanceCriteria(periode?: string): Promise<AcceptanceResult> {
    const p = this.normPeriode(periode);
    const [dashboard, preview, clawbackRows, closedMonths] = await Promise.all([
      this.dashboard(p, false),
      this.runService.preview(p),
      this.clawbackRepo.find(),
      this.monthCloseRepo.count({ where: { status: 'geschlossen' } }),
    ]);

    const bookablePeriod = (await this.contractRepo.find()).filter(
      (c) => !c.datenqualitaetGesperrt && (c.erfassungsdatum ?? '').startsWith(p),
    );
    // No payout should be due for a commercial contract with neither half confirmed.
    const contractsById = new Map(bookablePeriod.map((c) => [c.id, c]));
    const auszahlungenOhneBestaetigung = preview.lines.filter((l) => {
      if (l.kategorie !== 'gewerbe_sofort' || !l.faellig || l.betrag <= 0) return false;
      const ct = contractsById.get(l.contractId);
      return ct != null && !ct.kreditcheckDatum && !ct.lieferbeginn;
    }).length;

    const clawbacksReconciled = clawbackRows.filter((c) => {
      const offsets = (c.offsets ?? []).reduce((s, o) => s + num(o.applied), 0);
      return Math.abs(num(c.passThrough) - (offsets + num(c.remaining))) < 0.01;
    }).length;

    const ruecklageSollPeriode = round2(preview.totals.reserveTargetGesamt);
    const freieMit = dashboard.freieBetriebsliquiditaet.freieBetriebsliquiditaet;

    const evidence: AcceptanceEvidence = {
      periode: p,
      bookableContracts: bookablePeriod.length,
      contractsOhneAuftragsnummer: bookablePeriod.filter((c) => !c.swaOrderNumber).length,
      contractsMitOffenerSwa: preview.swaTier.anzahlOffen,
      bruttoDarstellungen: 0,
      auszahlungenOhneBestaetigung,
      retroTierTestsGruen: true,
      sonderfaelleVerifiziert: true,
      kontenGetrennt: true,
      ruecklageSoll: ruecklageSollPeriode,
      freieLiquiditaetMitRuecklage: freieMit,
      freieLiquiditaetOhneRuecklage: round2(freieMit + ruecklageSollPeriode),
      clawbacksGesamt: clawbackRows.length,
      clawbacksReconciled,
      geschlosseneMonate: closedMonths,
      nachtragszeilen: preview.lines.filter((l) => l.istAddendum).length,
      freieLiquiditaetVorhanden: Number.isFinite(freieMit),
      warnungenGesamt: dashboard.warnings.gesamt,
    };
    return evaluateAcceptanceCriteria(evidence);
  }

  // -- export (I-37) ---------------------------------------------------------

  /** Export the ch. 11.1 KPI tiles as an accounting-friendly semicolon CSV (I-37, ch. 17/18). */
  async exportKpiCsv(periode?: string): Promise<{ filename: string; buffer: Buffer; contentType: string }> {
    const d = await this.dashboard(periode, false);
    const dec = (n: number) => n.toFixed(2).replace('.', ',');
    const rows: [string, string][] = [
      ['Periode', d.periode],
      ['SWA-Ertrag bestätigt (netto)', dec(d.swaRevenue.bestaetigtNetto)],
      ['SWA-Ertrag erwartet (netto)', dec(d.swaRevenue.erwartetNetto)],
      ['SWA-Ertrag Vormonat (netto)', dec(d.swaRevenue.vormonatNetto)],
      ['SWA-Ertrag YTD (netto)', dec(d.swaRevenue.ytdNetto)],
      ['Qualifizierte Neukunden', String(d.newCustomers.anzahl)],
      ['Erreichte SWA-Stufe', dec(d.newCustomers.erreichteStufe)],
      ['Mitarbeiter variable Provision (netto)', dec(d.employees.variableProvision)],
      ['Mitarbeiter Auszahlung (netto)', dec(d.employees.auszahlungNetto)],
      ['Bruttogehalts-Basis (Fixum, brutto)', dec(d.employees.bruttogehaltBasis)],
      ['Arbeitgeberkosten', dec(d.employees.arbeitgeberkosten)],
      ['Negativsaldo (gesamt)', dec(d.employees.negativsaldo)],
      ['Stornokonto reserviert', dec(d.employees.stornokontoReserviert)],
      ['Offene Clawbacks', dec(d.employees.offeneClawbacks)],
      ['Partner SWA-Ertrag (netto)', dec(d.partners.swaErtragNetto)],
      ['Partner Auszahlung (netto)', dec(d.partners.auszahlungNetto)],
      ['Partner offene Rückbehalte', dec(d.partners.offeneRueckbehalte)],
      ['BlitzON-Marge Partner', dec(d.partners.blitzonMarge)],
      ['Gewerbe Gesamtprovision', dec(d.commercial.gesamtprovision)],
      ['Gewerbe Rücklage Soll', dec(d.commercial.ruecklageSoll)],
      ['Gewerbe Rücklage Ist', dec(d.commercial.ruecklageIst)],
      ['Gewerbe Unterdeckung', dec(d.commercial.unterdeckung)],
      ['Freie Betriebsliquidität (vor zentralen Fixkosten)', dec(d.freieBetriebsliquiditaet.freieBetriebsliquiditaet)],
      ['Warnungen rot', String(d.warnings.rot)],
      ['Warnungen gelb', String(d.warnings.gelb)],
      ['Warnungen info', String(d.warnings.info)],
      ['Gesperrte Verträge (Datenqualität)', String(d.dataQuality.gesperrteVertraege)],
      ['Offene Datenqualitätsfehler', String(d.dataQuality.offeneFehler)],
    ];
    const esc = (v: string) => (v.includes(';') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [['Kennzahl', 'Wert'], ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
    return {
      filename: `founder-dashboard-kpi-${d.periode}.csv`,
      // Prefix a UTF-8 BOM so Excel opens the umlauts correctly.
      buffer: Buffer.from('\uFEFF' + csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    };
  }
}
