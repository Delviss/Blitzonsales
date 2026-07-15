/**
 * Pure Founder-dashboard aggregation (I-27/I-29, Fachkonzept ch. 11.1).
 *
 * The Founder/Backoffice start page shows the ch. 11.1 KPI tiles, **net
 * throughout** (I-29): every euro figure is a net amount, and the one figure that
 * is a payroll gross — the base-salary basis — is labelled as such, never a
 * VAT-gross amount. The headline number is the **free operating liquidity before
 * central fixed costs**.
 *
 * The service loads the live data (reusing the exact run computation, the storno
 * accounts, the commercial reserves, the clawbacks, the warning system and the
 * data-quality view) and hands it in here as plain numbers; this module composes
 * the tiles and derives the free-operating-liquidity waterfall. Keeping it pure
 * means the headline number and the "reserves reduce free liquidity" invariant
 * (ch. 18 acceptance criterion 8) are unit-tested independent of persistence.
 */

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Inputs (all already net unless a field is explicitly a gross-salary basis)
// ---------------------------------------------------------------------------

/** SWA revenue tile — net, confirmed vs. expected, with prior month and YTD. */
export interface SwaRevenueInput {
  /** SWA revenue confirmed by the settlement list this month (net). */
  bestaetigtNetto: number;
  /** SWA revenue expected by the tier/plausibility control this month (net). */
  erwartetNetto: number;
  /** confirmed net SWA revenue of the prior month. */
  vormonatNetto: number;
  /** confirmed net SWA revenue year-to-date. */
  ytdNetto: number;
}

/** New customers & SWA tier tile. */
export interface NewCustomerTierInput {
  /** company-wide qualified new customers feeding the SWA tier. */
  anzahl: number;
  /** reached per-customer rate at the current tier. */
  erreichteStufe: number;
  /** next threshold count (or null at the top tier). */
  naechsteStufeAb: number | null;
  /** per-customer rate once the next threshold is reached (or null). */
  naechsteStufeSatz: number | null;
  /** contracts whose actual SWA commission deviates from the control. */
  anzahlAbweichungen: number;
}

/**
 * Internal-employee tile. `bruttogehaltBasis` is a **payroll gross** figure
 * (the guaranteed Fixum basis) — the only non-net figure on the dashboard, always
 * labelled as gross salary (I-29).
 */
export interface EmployeeBlockInput {
  /** variable commission earned (net, before salary protection). */
  variableProvision: number;
  /** base-salary basis (Fixum) — a payroll GROSS figure, labelled as such. */
  bruttogehaltBasis: number;
  /** net payout after salary protection / storno withholding / recovery. */
  auszahlungNetto: number;
  /** carried negative-commission balance across all employees. */
  negativsaldo: number;
  /** employer cost on the paid-out compensation. */
  arbeitgeberkosten: number;
  /** storno account reserved balance (liability buffer, not free profit). */
  stornokontoReserviert: number;
  /** open clawback receivables against employees. */
  offeneClawbacks: number;
}

/** Partner tile — partners are not salaried; everything shown net. */
export interface PartnerBlockInput {
  /** SWA revenue attributable to partner contracts (net). */
  swaErtragNetto: number;
  /** net payout to partners this month. */
  auszahlungNetto: number;
  /** open 12-month retention (Halteanteil) still held back. */
  offeneRueckbehalte: number;
  /** storno reserved against partner risk (if modelled). */
  stornoReserviert: number;
}

/** Commercial tile. */
export interface CommercialBlockInput {
  /** total commercial commission computed (consumption × surcharge). */
  gesamtprovision: number;
  /** first SWA half already confirmed. */
  ersteHaelfteBestaetigt: number;
  /** second SWA half already confirmed. */
  zweiteHaelfteBestaetigt: number;
  /** open retention commission not yet due. */
  offeneRueckbehalte: number;
  /** 20% reserve target across commercial contracts. */
  ruecklageSoll: number;
  /** 20% reserve actually set aside. */
  ruecklageIst: number;
}

export interface WarningCountsInput {
  rot: number;
  gelb: number;
  info: number;
  gesamt: number;
}

export interface DataQualityInput {
  letzterSync: string | null;
  gesperrteVertraege: number;
  offeneFehler: number;
  unbekannteVerkaeufer: number;
  unbekannteOrganisationen: number;
}

/**
 * The period flows that drive the free-operating-liquidity waterfall. Kept
 * separate from the display tiles (which carry cumulative posting-object
 * balances) so the headline stays a coherent single-period figure: every term is
 * a flow of the same billing month.
 */
export interface LiquidityPeriodFlows {
  /** commercial reserve set aside this period (20% of commercial profit). */
  ruecklageSollPeriode: number;
  /** 10% storno withholding accrued into the buffer this period. */
  stornoEinbehaltPeriode: number;
}

export interface FounderDashboardInput {
  periode: string;
  swaRevenue: SwaRevenueInput;
  newCustomers: NewCustomerTierInput;
  employees: EmployeeBlockInput;
  partners: PartnerBlockInput;
  commercial: CommercialBlockInput;
  liquidityFlows: LiquidityPeriodFlows;
  warnings: WarningCountsInput;
  dataQuality: DataQualityInput;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/**
 * The free-operating-liquidity waterfall (ch. 11.1 headline, ch. 18 criteria 8 &
 * 10). Starts from the confirmed net SWA revenue and subtracts every committed
 * outflow and set-aside for the period; reserves and the storno buffer explicitly
 * *reduce* the free figure (they are non-freely-available liquidity).
 */
export interface FreeLiquidityWaterfall {
  swaErtragBestaetigtNetto: number;
  minusAuszahlungMitarbeiter: number;
  minusAuszahlungPartner: number;
  minusArbeitgeberkosten: number;
  minusGewerbeRuecklageSoll: number;
  minusStornoReserviert: number;
  /** = SWA revenue − payouts − employer cost − reserves − storno buffer. */
  freieBetriebsliquiditaet: number;
  /** explicit note that this is before central fixed costs (Phase 1). */
  hinweis: string;
}

export interface FounderDashboardResult {
  periode: string;
  /** net throughout — the one gross figure (base-salary basis) is flagged. */
  nettoDarstellung: true;
  swaRevenue: SwaRevenueInput & { abweichungNetto: number; trendVormonat: number };
  newCustomers: NewCustomerTierInput;
  employees: EmployeeBlockInput & { deckungsbeitrag: number };
  partners: PartnerBlockInput & { blitzonMarge: number };
  commercial: CommercialBlockInput & { unterdeckung: number };
  freieBetriebsliquiditaet: FreeLiquidityWaterfall;
  warnings: WarningCountsInput;
  dataQuality: DataQualityInput;
}

/**
 * Compose the ch. 11.1 tiles and derive the free-operating-liquidity waterfall
 * from already-loaded net figures. Deterministic and side-effect free.
 */
export function computeFounderDashboard(input: FounderDashboardInput): FounderDashboardResult {
  const { swaRevenue: s, employees: e, partners: p, commercial: cm, liquidityFlows: lf } = input;

  // Free operating liquidity before central fixed costs (ch. 11.1 headline). A
  // coherent single-period figure: every term is a flow of this billing month.
  // The reserve set-aside and the storno withholding are non-freely-available,
  // so they reduce it (ch. 18 acceptance criterion 8).
  const waterfall: FreeLiquidityWaterfall = {
    swaErtragBestaetigtNetto: round2(s.bestaetigtNetto),
    minusAuszahlungMitarbeiter: round2(e.auszahlungNetto),
    minusAuszahlungPartner: round2(p.auszahlungNetto),
    minusArbeitgeberkosten: round2(e.arbeitgeberkosten),
    minusGewerbeRuecklageSoll: round2(lf.ruecklageSollPeriode),
    minusStornoReserviert: round2(lf.stornoEinbehaltPeriode),
    freieBetriebsliquiditaet: round2(
      s.bestaetigtNetto -
        e.auszahlungNetto -
        p.auszahlungNetto -
        e.arbeitgeberkosten -
        lf.ruecklageSollPeriode -
        lf.stornoEinbehaltPeriode,
    ),
    hinweis:
      'Freie Betriebsliquidität vor zentralen Fixkosten (Phase 1). Rücklagen und Stornoeinbehalte mindern die frei verfügbare Liquidität.',
  };

  // Employee contribution (Deckungsbeitrag): net payout + employer cost is the
  // cost of the internal channel against the SWA revenue it produced. Kept as a
  // simple net margin proxy for the tile.
  const deckungsbeitrag = round2(s.bestaetigtNetto - e.auszahlungNetto - e.arbeitgeberkosten);

  // Partner BlitzON margin: SWA revenue attributable to partners minus the net
  // partner payout and the retention still held.
  const blitzonMarge = round2(p.swaErtragNetto - p.auszahlungNetto - p.offeneRueckbehalte);

  return {
    periode: input.periode,
    nettoDarstellung: true,
    swaRevenue: {
      ...s,
      abweichungNetto: round2(s.bestaetigtNetto - s.erwartetNetto),
      trendVormonat: round2(s.bestaetigtNetto - s.vormonatNetto),
    },
    newCustomers: input.newCustomers,
    employees: { ...e, deckungsbeitrag },
    partners: { ...p, blitzonMarge },
    commercial: { ...cm, unterdeckung: round2(Math.max(0, cm.ruecklageSoll - cm.ruecklageIst)) },
    freieBetriebsliquiditaet: waterfall,
    warnings: input.warnings,
    dataQuality: input.dataQuality,
  };
}
