import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientType } from '@blitzon/shared';
import { Contract } from '../entities/contract.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Organisation } from '../entities/organisation.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { FinancialEvent } from '../entities/financial-event.entity';
import { Wiedervorlage } from '../entities/wiedervorlage.entity';
import { LedgerService } from '../config-store/ledger.service';
import { FachkonzeptRunService } from '../commissions/fachkonzept/fachkonzept-run.service';
import { StornoAccountService } from '../posting-objects/storno-account.service';
import { CommercialReserveService } from '../posting-objects/commercial-reserve.service';
import { ClawbackService } from '../posting-objects/clawback.service';

const PERIODE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => (v == null ? 0 : Number(v));

/**
 * Drill-down views for the Founder dashboard (I-28, Fachkonzept ch. 11.2 / 18).
 *
 * The single acceptance criterion is **traceability**: every figure must be
 * traceable to the individual SWA order number. So every contract-level row a
 * drill-down emits carries its `swaOrderNumber`, and the contract drill-down
 * exposes the full append-only status + financial history keyed on that number.
 * All euro figures are net (I-29); the reused run preview keeps them identical to
 * the eventual booking.
 */
@Injectable()
export class DrilldownService {
  constructor(
    @InjectRepository(Contract) private readonly contractRepo: Repository<Contract>,
    @InjectRepository(SalesRep) private readonly repRepo: Repository<SalesRep>,
    @InjectRepository(Organisation) private readonly orgRepo: Repository<Organisation>,
    @InjectRepository(CommissionLine) private readonly lineRepo: Repository<CommissionLine>,
    @InjectRepository(FinancialEvent) private readonly financialRepo: Repository<FinancialEvent>,
    @InjectRepository(Wiedervorlage) private readonly wiedervorlageRepo: Repository<Wiedervorlage>,
    private readonly ledger: LedgerService,
    private readonly runService: FachkonzeptRunService,
    private readonly storno: StornoAccountService,
    private readonly reserves: CommercialReserveService,
    private readonly clawbacks: ClawbackService,
  ) {}

  private assertPeriode(p: string): void {
    if (!PERIODE_RE.test(p)) throw new BadRequestException('periode muss im Format JJJJ-MM angegeben werden.');
  }

  // --- Month drill-down -----------------------------------------------------

  async monat(periode: string) {
    this.assertPeriode(periode);
    const preview = await this.runService.preview(periode).catch(() => null);
    const contracts = (await this.contractRepo.find()).filter((ct) => (ct.erfassungsdatum ?? '').startsWith(periode));

    const statusSplit: Record<string, number> = {};
    for (const ct of contracts) statusSplit[ct.status] = (statusSplit[ct.status] ?? 0) + 1;

    const payoutByContract = new Map<string, number>();
    for (const l of preview?.lines ?? []) {
      if (l.faellig) payoutByContract.set(l.contractId, round2((payoutByContract.get(l.contractId) ?? 0) + l.betrag));
    }

    // Corrections booked in this month (manual overrides / clawbacks) — from the
    // append-only ledger, referencing the original SWA order number.
    const korrekturRows = await this.financialRepo.find({ where: { monat: periode } });
    const korrekturen = korrekturRows
      .filter((e) => ['correction', 'clawback', 'override'].some((t) => e.typ.includes(t)))
      .map((e) => ({
        typ: e.typ,
        betrag: num(e.betrag),
        swaOrderNumber: e.swaOrderNumber,
        contractId: e.contractId,
        begruendung: e.begruendung,
        createdAt: e.createdAt,
      }));

    return {
      periode,
      volumen: {
        anzahlVertraege: contracts.length,
        gesamtverbrauch: round2(contracts.reduce((s, ct) => s + num(ct.previousVolume ?? ct.verbrauch), 0)),
      },
      statusVerteilung: statusSplit,
      swaTier: preview?.swaTier ?? null,
      auszahlungen: preview?.totals ?? null,
      korrekturen,
      vertraege: contracts.map((ct) => ({
        contractId: ct.id,
        swaOrderNumber: ct.swaOrderNumber,
        kunde: ct.kunde,
        repId: ct.repId,
        status: ct.status,
        clientType: ct.clientType,
        erwarteteSwaProvision: num(ct.erwarteteSwaProvision),
        tatsaechlicheSwaProvision: num(ct.tatsaechlicheSwaProvision),
        abweichung: num(ct.abweichung),
        plausibilitaetStatus: ct.plausibilitaetStatus,
        auszahlung: payoutByContract.get(ct.id) ?? 0,
      })),
    };
  }

  // --- Rep drill-down -------------------------------------------------------

  async rep(repId: string, periode: string) {
    this.assertPeriode(periode);
    const rep = await this.repRepo.findOne({ where: { id: repId }, relations: ['organisation'] });
    if (!rep) throw new NotFoundException('Verkäufer nicht gefunden.');
    const preview = await this.runService.preview(periode).catch(() => null);
    const summary = preview?.repSummaries.find((s) => s.repId === repId) ?? null;

    const allContracts = await this.contractRepo.find({ where: { repId } });
    const contracts = allContracts.filter((ct) => (ct.erfassungsdatum ?? '').startsWith(periode));
    const myLines = (preview?.lines ?? []).filter((l) => l.repId === repId);
    const [stornoView] = await this.storno.summary(repId);
    const clawbacks = (await this.clawbacks.findAll()).filter((c) => c.repId === repId);
    const offeneRetention = round2(
      myLines.filter((l) => l.kategorie === 'gewerbe_ruecklage').reduce((s, l) => s + l.betrag, 0),
    );

    return {
      repId,
      name: rep.name,
      organisation: rep.organisation ? { id: rep.organisation.id, name: rep.organisation.name } : null,
      istPartner: summary?.isPartner ?? rep.organisation?.orgTyp === 'partner',
      qualifizierteNeukunden: summary?.qualifiedNewCount ?? 0,
      staffelAktuell: summary?.tierRate ?? 0,
      earnings: {
        variableProvision: summary?.variableProvision ?? 0,
        auszahlung: summary?.auszahlung ?? 0,
        auszahlungGesperrt: summary?.auszahlungGesperrt ?? false,
      },
      // Payroll figures — explicitly gross salary (I-29), separate from the net
      // commission above.
      bruttoGehaltBasis: num(rep.grundgehalt),
      negativsaldo: summary?.negativsaldoAfter ?? num(rep.negativsaldo),
      stornoKonto: stornoView ?? null,
      offeneRetention,
      clawbacks: clawbacks.map((c) => ({
        id: c.id,
        swaOrderNumber: c.swaOrderNumber,
        contractId: c.contractId,
        passThrough: num(c.passThrough),
        remaining: num(c.remaining),
        inkassoStatus: c.inkassoStatus,
      })),
      deckungsbeitrag: round2((summary?.variableProvision ?? 0) - (summary?.stornoEinbehalt ?? 0)),
      vertraege: contracts.map((ct) => this.contractRow(ct)),
    };
  }

  // --- Organisation drill-down ---------------------------------------------

  async organisation(orgId: string, periode: string) {
    this.assertPeriode(periode);
    const org = await this.orgRepo.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organisation nicht gefunden.');
    const preview = await this.runService.preview(periode).catch(() => null);

    const reps = await this.repRepo.find({ where: { organisationId: orgId } });
    const repIds = new Set(reps.map((r) => r.id));
    const contracts = (await this.contractRepo.find({ where: { organisationId: orgId } })).filter((ct) =>
      (ct.erfassungsdatum ?? '').startsWith(periode),
    );
    const orgLines = (preview?.lines ?? []).filter((l) => l.repId && repIds.has(l.repId));

    const swaRevenue = round2(contracts.reduce((s, ct) => s + num(ct.tatsaechlicheSwaProvision), 0));
    const auszahlung = round2(orgLines.filter((l) => l.faellig).reduce((s, l) => s + l.betrag, 0));
    const gewerbeClaims = round2(
      orgLines.filter((l) => l.kategorie === 'gewerbe_sofort' || l.kategorie === 'gewerbe_ruecklage').reduce((s, l) => s + l.betrag, 0),
    );
    const stornoViews = await this.storno.summary();
    const orgStorno = round2(stornoViews.filter((v) => repIds.has(v.repId)).reduce((s, v) => s + v.gesamtsaldo, 0));
    const reserves = (await this.reserves.findAll()).filter((r) => r.repId && repIds.has(r.repId));
    const reserveGebunden = round2(reserves.filter((r) => !r.freigegebenAm).reduce((s, r) => s + num(r.reserveActual), 0));

    return {
      organisationId: orgId,
      name: org.name,
      orgTyp: org.orgTyp,
      // Phase 1: no central fixed-cost allocation (ch. 11.2).
      hinweis: 'Keine zentrale Fixkosten-Umlage in Phase 1 (Fachkonzept 11.2).',
      anzahlVertraege: contracts.length,
      swaUmsatz: swaRevenue,
      auszahlung,
      gewerbeClaims,
      storno: orgStorno,
      reserveGebunden,
      blitzonMarge: round2(swaRevenue - auszahlung),
      vertraege: contracts.map((ct) => this.contractRow(ct)),
    };
  }

  // --- Contract drill-down (the leaf: one SWA order number) -----------------

  async vertrag(contractId: string) {
    const ct = await this.contractRepo.findOne({ where: { id: contractId }, relations: ['organisation', 'rep', 'produkt'] });
    if (!ct) throw new NotFoundException('Vertrag nicht gefunden.');
    const [statusHistory, financialHistory, lines, reserves, clawbacks, wiedervorlagen] = await Promise.all([
      this.ledger.statusHistory(contractId),
      this.ledger.financialHistory(contractId),
      this.lineRepo.find({ where: { contractId }, relations: ['run'], order: { id: 'ASC' } }),
      this.reserves.findAll().then((rs) => rs.filter((r) => r.contractId === contractId)),
      this.clawbacks.findAll().then((cs) => cs.filter((c) => c.contractId === contractId)),
      this.wiedervorlageRepo.find({ where: { contractId }, order: { faelligAm: 'ASC' } }),
    ]);

    return {
      contractId: ct.id,
      swaOrderNumber: ct.swaOrderNumber,
      joulesId: ct.joulesId,
      kunde: ct.kunde,
      status: ct.status,
      clientType: ct.clientType,
      lieferbeginn: ct.lieferbeginn,
      vertragEnde: ct.vertragEnde,
      swaRevenue: {
        gesamtprovision: num(ct.swaGesamtprovision),
        zahlbetrag: num(ct.swaZahlbetrag),
        erwartet: num(ct.erwarteteSwaProvision),
        tatsaechlich: num(ct.tatsaechlicheSwaProvision),
        abweichung: num(ct.abweichung),
        manuellerOverride: ct.manuellerOverride == null ? null : num(ct.manuellerOverride),
        plausibilitaetStatus: ct.plausibilitaetStatus,
      },
      berechneteWerte: lines.map((l) => ({
        runId: l.runId,
        periode: l.run?.periode ?? null,
        runStatus: l.run?.status ?? null,
        typ: l.typ,
        betrag: num(l.betrag),
        begruendung: l.begruendung,
        datencheck: l.datencheck,
      })),
      statusHistorie: statusHistory.map((e) => ({
        status: e.status,
        quelle: e.quelle,
        swaOrderNumber: e.swaOrderNumber,
        monat: e.monat,
        createdAt: e.createdAt,
      })),
      finanzHistorie: financialHistory.map((e) => ({
        typ: e.typ,
        betrag: num(e.betrag),
        monat: e.monat,
        swaOrderNumber: e.swaOrderNumber,
        quelle: e.quelle,
        begruendung: e.begruendung,
        createdAt: e.createdAt,
      })),
      ruecklagen: reserves.map((r) => ({
        id: r.id,
        periode: r.periode,
        reserveTarget: num(r.reserveTarget),
        reserveActual: num(r.reserveActual),
        status: r.status,
        freigegebenAm: r.freigegebenAm,
      })),
      clawbacks: clawbacks.map((c) => ({
        id: c.id,
        passThrough: num(c.passThrough),
        remaining: num(c.remaining),
        inkassoStatus: c.inkassoStatus,
      })),
      wiedervorlagen: wiedervorlagen.map((w) => ({
        id: w.id,
        faelligAm: w.faelligAm,
        status: w.status,
        grund: w.grund,
      })),
    };
  }

  // --- Reserves drill-down (storno accounts + commercial reserves) ----------

  async ruecklagen() {
    const [stornoViews, reserveSummary] = await Promise.all([this.storno.summary(), this.reserves.summary()]);
    return {
      stornokonten: {
        proPerson: stornoViews,
        gesamt: await this.storno.total(),
      },
      gewerbeRuecklagen: {
        gesamt: reserveSummary.total,
        proVertrag: reserveSummary.perContract.map((r) => ({
          id: r.id,
          contractId: r.contractId,
          swaOrderNumber: (r as any).contract?.swaOrderNumber ?? null,
          repId: r.repId,
          periode: r.periode,
          reserveTarget: num(r.reserveTarget),
          reserveActual: num(r.reserveActual),
          status: r.status,
          freigegebenAm: r.freigegebenAm,
        })),
      },
    };
  }

  private contractRow(ct: Contract) {
    return {
      contractId: ct.id,
      swaOrderNumber: ct.swaOrderNumber,
      kunde: ct.kunde,
      status: ct.status,
      clientType: ct.clientType,
      istGewerbe: ct.clientType === ClientType.Gewerbe,
      erwarteteSwaProvision: num(ct.erwarteteSwaProvision),
      tatsaechlicheSwaProvision: num(ct.tatsaechlicheSwaProvision),
      plausibilitaetStatus: ct.plausibilitaetStatus,
      lieferbeginn: ct.lieferbeginn,
      vertragEnde: ct.vertragEnde,
    };
  }
}
