/**
 * Pure roll-up helpers for the Founder dashboard KPI tiles (I-27, Fachkonzept
 * ch. 11.1) and the **free operating liquidity** figure that anchors them.
 *
 * All management figures are **net** (I-29, ch. 2): the euro amounts here are the
 * commission / SWA-commission / reserve values the model computes, never a
 * VAT-gross amount. "Gross salary" (Bruttolohn) is the only gross concept and is
 * a payroll figure — it is labelled as such at the presentation layer, not mixed
 * into these net roll-ups.
 *
 * The service (`kennzahlen.service.ts`) loads the live data — reusing the exact
 * run computation (`FachkonzeptRunService.preview`) so the tiles never diverge
 * from the eventual booking — and hands plain aggregates to these functions so
 * the arithmetic (especially the free-liquidity subtraction chain) is unit
 * tested in isolation.
 */

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------
// Free operating liquidity (ch. 11.1 / ch. 18 criterion 8 + 11)
// ---------------------------------------------------------------------------

/**
 * The inflow and the committed obligations that determine how much of the
 * confirmed SWA money BlitzON may actually use. Every field is a **net** euro
 * amount. Reserves and the storno buffer are liabilities and therefore *reduce*
 * free liquidity (ch. 18: "reserves reduce free liquidity").
 */
export interface LiquidityInput {
  /** confirmed SWA commission actually received this month (the only inflow). */
  bestaetigterSwaUmsatz: number;
  /** commission due for payout this month (employees + partners + overheads). */
  faelligeAuszahlungen: number;
  /** employer cost carried on the due employee payouts. */
  arbeitgeberkosten: number;
  /** storno-account balance held back as a risk buffer (not free profit). */
  stornoKontoReserviert: number;
  /** commercial reserve still bound (not yet released after contract end). */
  gebundeneGewerbeRuecklage: number;
  /** open clawback receivables at risk of not being recovered. */
  offeneClawbackForderungen: number;
}

export interface LiquidityResult {
  /** the free operating liquidity: inflow minus every committed obligation. */
  wert: number;
  /** the individual components, so the figure is fully transparent (ch. 18). */
  komponenten: LiquidityInput;
}

/**
 * Free operating liquidity = confirmed SWA revenue − due payouts − employer cost
 * − storno buffer − bound commercial reserves − open clawback receivables. The
 * result may be negative (an early month with reserves committed but little
 * confirmed revenue), which is itself a signal the Founder must see.
 */
export function computeFreeLiquidity(input: LiquidityInput): LiquidityResult {
  const komponenten: LiquidityInput = {
    bestaetigterSwaUmsatz: round2(input.bestaetigterSwaUmsatz),
    faelligeAuszahlungen: round2(input.faelligeAuszahlungen),
    arbeitgeberkosten: round2(input.arbeitgeberkosten),
    stornoKontoReserviert: round2(input.stornoKontoReserviert),
    gebundeneGewerbeRuecklage: round2(input.gebundeneGewerbeRuecklage),
    offeneClawbackForderungen: round2(input.offeneClawbackForderungen),
  };
  const wert = round2(
    komponenten.bestaetigterSwaUmsatz -
      komponenten.faelligeAuszahlungen -
      komponenten.arbeitgeberkosten -
      komponenten.stornoKontoReserviert -
      komponenten.gebundeneGewerbeRuecklage -
      komponenten.offeneClawbackForderungen,
  );
  return { wert, komponenten };
}

// ---------------------------------------------------------------------------
// Employee / partner roll-ups
// ---------------------------------------------------------------------------

/** A per-rep summary as the preview produces it (the fields the tiles need). */
export interface RepRollupLine {
  repId: string;
  isPartner: boolean;
  variableProvision: number;
  auszahlung: number;
  negativsaldoAfter: number;
  stornoEinbehalt: number;
}

export interface EmployeeTile {
  /** number of internal employees with activity this month. */
  anzahl: number;
  /** net variable commission earned by employees. */
  provision: number;
  /** net payout after salary protection / storno withholding. */
  nettoAuszahlung: number;
  /** guaranteed gross salary base (Fixum × active employees) — payroll, gross. */
  bruttoGehaltBasis: number;
  /** carried negative-commission balances across all employees. */
  negativsaldoGesamt: number;
  /** employer cost carried on the net payouts. */
  arbeitgeberkosten: number;
  /** 10% withheld into the storno accounts this month. */
  stornoEinbehalt: number;
  /** contribution margin: employee commission net of employer cost. */
  deckungsbeitrag: number;
}

export function rollupEmployees(
  reps: RepRollupLine[],
  opts: { fixum: number; employerCostRate: number },
): EmployeeTile {
  const employees = reps.filter((r) => !r.isPartner);
  const provision = round2(employees.reduce((s, r) => s + r.variableProvision, 0));
  const nettoAuszahlung = round2(employees.reduce((s, r) => s + r.auszahlung, 0));
  const negativsaldoGesamt = round2(employees.reduce((s, r) => s + r.negativsaldoAfter, 0));
  const stornoEinbehalt = round2(employees.reduce((s, r) => s + r.stornoEinbehalt, 0));
  const arbeitgeberkosten = round2(nettoAuszahlung * opts.employerCostRate);
  return {
    anzahl: employees.length,
    provision,
    nettoAuszahlung,
    bruttoGehaltBasis: round2(employees.length * opts.fixum),
    negativsaldoGesamt,
    arbeitgeberkosten,
    stornoEinbehalt,
    deckungsbeitrag: round2(provision - arbeitgeberkosten),
  };
}

export interface PartnerTile {
  anzahl: number;
  /** net partner commission (their revenue share). */
  umsatz: number;
  /** net payout to partners this month. */
  nettoAuszahlung: number;
  /** open (non-due) retention commission held for partners. */
  offeneRuecklage: number;
  /** BlitzON margin on partner business: confirmed SWA revenue − partner payout. */
  blitzonMarge: number;
}

export function rollupPartners(
  reps: RepRollupLine[],
  opts: { offeneRuecklage: number; bestaetigterSwaUmsatzPartner: number },
): PartnerTile {
  const partners = reps.filter((r) => r.isPartner);
  const umsatz = round2(partners.reduce((s, r) => s + r.variableProvision, 0));
  const nettoAuszahlung = round2(partners.reduce((s, r) => s + r.auszahlung, 0));
  return {
    anzahl: partners.length,
    umsatz,
    nettoAuszahlung,
    offeneRuecklage: round2(opts.offeneRuecklage),
    blitzonMarge: round2(opts.bestaetigterSwaUmsatzPartner - nettoAuszahlung),
  };
}

// ---------------------------------------------------------------------------
// Commercial roll-up (ch. 6 / 10.2)
// ---------------------------------------------------------------------------

export interface CommercialTile {
  /** number of commercial contracts booked this month. */
  anzahl: number;
  /** total commercial commission (kWh × surcharge) across the month. */
  gesamtProvision: number;
  /** the immediate (due) share paid out on confirmed SWA halves. */
  sofortAnteil: number;
  /** the 12-month retention share still held back (not due). */
  ruecklageAnteil: number;
  /** commercial reserve target (20% of SWA profit). */
  reserveTarget: number;
  /** commercial reserve actually funded. */
  reserveActual: number;
  /** under-funding across all reserves (target − actual where under target). */
  unterdeckung: number;
  /** number of contracts flagged as at-risk (surcharge over cap / under-funded). */
  risiken: number;
}

export interface CommercialAggregate {
  anzahl: number;
  gesamtProvision: number;
  sofortAnteil: number;
  ruecklageAnteil: number;
  reserveTarget: number;
  reserveActual: number;
  unterdeckung: number;
  risiken: number;
}

export function rollupCommercial(agg: CommercialAggregate): CommercialTile {
  return {
    anzahl: agg.anzahl,
    gesamtProvision: round2(agg.gesamtProvision),
    sofortAnteil: round2(agg.sofortAnteil),
    ruecklageAnteil: round2(agg.ruecklageAnteil),
    reserveTarget: round2(agg.reserveTarget),
    reserveActual: round2(agg.reserveActual),
    unterdeckung: round2(agg.unterdeckung),
    risiken: agg.risiken,
  };
}
