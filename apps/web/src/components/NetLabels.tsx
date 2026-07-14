/**
 * Net-presentation & gross-salary labelling convention (I-29, Fachkonzept ch. 2
 * / 18).
 *
 * Every management figure in BlitzON Control is **net** by default — the euro
 * amounts are the model's net commission / SWA-commission / reserve values,
 * never a VAT-gross amount. The one gross concept is "Bruttolohn" (gross salary),
 * a payroll figure; wherever a salary value appears it must be unmistakably
 * marked as gross-salary basis so no view ever mixes net and gross ambiguously.
 *
 * These small shared badges/labels are the single place that convention is
 * expressed, so every Wave-6 surface (KPI tiles, drill-downs) reads the same.
 */

const eurFmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a net euro amount. All KPI/drill-down euro values go through this. */
export function eurNet(n: number | null | undefined): string {
  return eurFmt.format(Number(n ?? 0));
}

/** A subtle "netto" chip appended to a section/tile that shows net figures. */
export function NettoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Nettobetrag (Fachkonzept 2/18)"
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/25 ${className}`}
    >
      netto
    </span>
  );
}

/** An amber "Bruttolohn" chip marking a payroll (gross-salary) figure. */
export function BruttolohnBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Bruttolohn — Lohn-/Gehaltsgröße, kein USt-Bruttobetrag (Fachkonzept 2)"
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-amber bg-amber/10 border border-amber/25 ${className}`}
    >
      Bruttolohn
    </span>
  );
}

/** The standing "all figures net" note shown once at the top of a view. */
export function NetHint({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[11.5px] text-steel2 ${className}`}>
      <NettoBadge />
      <span>
        Alle Beträge netto. Gehaltswerte sind als <span className="text-amber font-semibold">Bruttolohn</span> gekennzeichnet
        (Fachkonzept 2/18).
      </span>
    </div>
  );
}
