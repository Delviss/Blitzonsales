import { useEffect, useState } from 'react';
import { apiFetch, apiDownload } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { AlertIcon, CheckIcon, DownloadIcon, EuroIcon, FileCheckIcon, RefreshIcon, ShieldIcon, UsersIcon } from '../components/icons';

/* --- types (mirror the Founder dashboard service payload) --- */

interface Waterfall {
  swaErtragBestaetigtNetto: number;
  minusAuszahlungMitarbeiter: number;
  minusAuszahlungPartner: number;
  minusArbeitgeberkosten: number;
  minusGewerbeRuecklageSoll: number;
  minusStornoReserviert: number;
  freieBetriebsliquiditaet: number;
  hinweis: string;
}

interface Dashboard {
  periode: string;
  nettoDarstellung: boolean;
  swaRevenue: { bestaetigtNetto: number; erwartetNetto: number; vormonatNetto: number; ytdNetto: number; abweichungNetto: number; trendVormonat: number };
  newCustomers: { anzahl: number; erreichteStufe: number; naechsteStufeAb: number | null; naechsteStufeSatz: number | null; anzahlAbweichungen: number };
  employees: { variableProvision: number; bruttogehaltBasis: number; auszahlungNetto: number; negativsaldo: number; arbeitgeberkosten: number; stornokontoReserviert: number; offeneClawbacks: number; deckungsbeitrag: number };
  partners: { swaErtragNetto: number; auszahlungNetto: number; offeneRueckbehalte: number; blitzonMarge: number };
  commercial: { gesamtprovision: number; ersteHaelfteBestaetigt: number; zweiteHaelfteBestaetigt: number; offeneRueckbehalte: number; ruecklageSoll: number; ruecklageIst: number; unterdeckung: number };
  freieBetriebsliquiditaet: Waterfall;
  warnings: { rot: number; gelb: number; info: number; gesamt: number };
  dataQuality: { letzterSync: string | null; gesperrteVertraege: number; offeneFehler: number; unbekannteVerkaeufer: number; unbekannteOrganisationen: number };
  realtime: {
    provisorisch: boolean;
    hinweis: string;
    swaTier: { qualifizierteNeukunden: number; erreichteStufe: number; naechsteStufeAb: number | null; naechsteStufeSatz: number | null };
    repTierProjektionen: { repId: string; isPartner: boolean; qualifiedNewCount: number; reachedRate: number; bisNaechsteStufe: number | null; nextRate: number | null; potenzialNaechsteStufe: number | null; variableProvision: number }[];
    reversals: { contractId: string; swaOrderNumber: string | null; kunde: string | null; status: string; finanzielleAuswirkung: number }[];
    reversalImpactGesamt: number;
  } | null;
}

interface Criterion { nr: number; code: string; titel: string; art: string; erfuellt: boolean; nachweis: string; ref: string }
interface Acceptance { periode: string; erfuellt: number; gesamt: number; alleErfuellt: boolean; kriterien: Criterion[] }

const eur = (n: number) => `€ ${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const currentPeriode = () => new Date().toISOString().slice(0, 7);

function KpiCell({ label, value, tone = 'text-white', hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
      <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums mt-0.5 ${tone}`}>{value}</div>
      {hint && <div className="text-[10.5px] text-steel mt-0.5">{hint}</div>}
    </div>
  );
}

function TileCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-brand">{icon}</span>
        <h2 className="font-bold text-white text-sm">{title}</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

export default function FounderDashboardPage() {
  const [periode, setPeriode] = useState(currentPeriode());
  const [data, setData] = useState<Dashboard | null>(null);
  const [akzeptanz, setAkzeptanz] = useState<Acceptance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p: string) => {
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch(`/api/founder-dashboard?periode=${encodeURIComponent(p)}`).then(r => (r.ok ? r.json() : Promise.reject(new Error('Fehler beim Laden des Dashboards.')))),
      apiFetch(`/api/founder-dashboard/akzeptanzkriterien?periode=${encodeURIComponent(p)}`).then(r => (r.ok ? r.json() : Promise.resolve(null))),
    ])
      .then(([d, a]) => { setData(d); setAkzeptanz(a); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(periode); /* eslint-disable-next-line */ }, []);

  const w = data?.freieBetriebsliquiditaet;

  return (
    <div>
      <PageHeader
        kicker="Founder-Dashboard"
        title="Founder-Dashboard (netto)"
        subtitle="Kennzahlen nach Fachkonzept Kap. 11.1 — durchgängig netto. Gehaltswerte sind ausdrücklich als Bruttogehalts-Basis gekennzeichnet (I-27/I-29)."
        actions={
          <div className="flex items-center gap-2">
            <input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            <button onClick={() => apiDownload(`/api/founder-dashboard/export?periode=${encodeURIComponent(periode)}`, `founder-dashboard-kpi-${periode}.csv`)} className="btn-ghost">
              <DownloadIcon size={15} /> Export
            </button>
            <button onClick={() => load(periode)} disabled={loading} className="btn-primary">
              <RefreshIcon size={15} /> {loading ? 'Lädt…' : 'Aktualisieren'}
            </button>
          </div>
        }
      />

      {error && <p className="text-sm text-red mb-4">{error}</p>}

      <div className="rounded-xl bg-brand/10 border border-brand/25 px-4 py-2.5 mb-6 flex items-center gap-2">
        <ShieldIcon size={15} />
        <span className="text-[12px] text-brand-soft"><span className="font-semibold">Netto-Darstellung.</span> Alle Beträge sind Netto-Werte; „Bruttogehalts-Basis" ist eine Lohn-Brutto-Kennzahl, kein USt-Brutto.</span>
      </div>

      {/* Headline: free operating liquidity waterfall */}
      {w && (
        <div className="card p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[11px] text-steel uppercase tracking-wider font-semibold">Freie Betriebsliquidität (vor zentralen Fixkosten)</div>
              <div className={`text-[34px] font-extrabold tracking-tight tabular-nums mt-1 ${w.freieBetriebsliquiditaet >= 0 ? 'text-brand-soft' : 'text-red'}`}>{eur(w.freieBetriebsliquiditaet)}</div>
              <div className="text-[11px] text-steel mt-1 max-w-md">{w.hinweis}</div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] min-w-[280px]">
              <span className="text-steel2">SWA-Ertrag bestätigt</span><span className="text-right tabular-nums text-ink">{eur(w.swaErtragBestaetigtNetto)}</span>
              <span className="text-steel2">− Auszahlung Mitarbeiter</span><span className="text-right tabular-nums text-steel2">{eur(w.minusAuszahlungMitarbeiter)}</span>
              <span className="text-steel2">− Auszahlung Partner</span><span className="text-right tabular-nums text-steel2">{eur(w.minusAuszahlungPartner)}</span>
              <span className="text-steel2">− Arbeitgeberkosten</span><span className="text-right tabular-nums text-steel2">{eur(w.minusArbeitgeberkosten)}</span>
              <span className="text-steel2">− Gewerbe-Rücklage (Soll)</span><span className="text-right tabular-nums text-amber">{eur(w.minusGewerbeRuecklageSoll)}</span>
              <span className="text-steel2">− Storno-Einbehalt</span><span className="text-right tabular-nums text-amber">{eur(w.minusStornoReserviert)}</span>
            </div>
          </div>
        </div>
      )}

      {/* KPI tiles (ch. 11.1) */}
      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {data && (
          <>
            <TileCard title="SWA-Ertrag (netto)" icon={<EuroIcon size={16} />}>
              <KpiCell label="Bestätigt" value={eur(data.swaRevenue.bestaetigtNetto)} tone="text-brand-soft" />
              <KpiCell label="Erwartet" value={eur(data.swaRevenue.erwartetNetto)} />
              <KpiCell label="Vormonat" value={eur(data.swaRevenue.vormonatNetto)} hint={`Trend ${eur(data.swaRevenue.trendVormonat)}`} />
              <KpiCell label="YTD" value={eur(data.swaRevenue.ytdNetto)} />
            </TileCard>

            <TileCard title="Neukunden & SWA-Stufe" icon={<UsersIcon size={16} />}>
              <KpiCell label="Qualifizierte Neukunden" value={String(data.newCustomers.anzahl)} />
              <KpiCell label="Erreichte Stufe" value={eur(data.newCustomers.erreichteStufe)} tone="text-brand-soft" />
              <KpiCell label="Nächste Stufe ab" value={data.newCustomers.naechsteStufeAb == null ? 'Höchste' : String(data.newCustomers.naechsteStufeAb)} hint={data.newCustomers.naechsteStufeSatz == null ? undefined : `${eur(data.newCustomers.naechsteStufeSatz)}/Vertrag`} />
              <KpiCell label="Abweichungen" value={String(data.newCustomers.anzahlAbweichungen)} tone={data.newCustomers.anzahlAbweichungen > 0 ? 'text-amber' : 'text-white'} />
            </TileCard>

            <TileCard title="Interne Mitarbeiter (netto)" icon={<UsersIcon size={16} />}>
              <KpiCell label="Variable Provision" value={eur(data.employees.variableProvision)} />
              <KpiCell label="Auszahlung" value={eur(data.employees.auszahlungNetto)} />
              <KpiCell label="Bruttogehalts-Basis (brutto)" value={eur(data.employees.bruttogehaltBasis)} tone="text-amber" hint="Lohn-Brutto" />
              <KpiCell label="Arbeitgeberkosten" value={eur(data.employees.arbeitgeberkosten)} />
              <KpiCell label="Negativsaldo" value={eur(data.employees.negativsaldo)} tone={data.employees.negativsaldo > 0 ? 'text-amber' : 'text-white'} />
              <KpiCell label="Stornokonto reserviert" value={eur(data.employees.stornokontoReserviert)} />
              <KpiCell label="Offene Clawbacks" value={eur(data.employees.offeneClawbacks)} tone={data.employees.offeneClawbacks > 0 ? 'text-red' : 'text-white'} />
              <KpiCell label="Deckungsbeitrag" value={eur(data.employees.deckungsbeitrag)} tone="text-brand-soft" />
            </TileCard>

            <TileCard title="Partner (netto)" icon={<UsersIcon size={16} />}>
              <KpiCell label="SWA-Ertrag" value={eur(data.partners.swaErtragNetto)} />
              <KpiCell label="Auszahlung" value={eur(data.partners.auszahlungNetto)} />
              <KpiCell label="Offene Rückbehalte" value={eur(data.partners.offeneRueckbehalte)} />
              <KpiCell label="BlitzON-Marge" value={eur(data.partners.blitzonMarge)} tone="text-brand-soft" />
            </TileCard>

            <TileCard title="Gewerbe" icon={<EuroIcon size={16} />}>
              <KpiCell label="Gesamtprovision" value={eur(data.commercial.gesamtprovision)} />
              <KpiCell label="1. Hälfte bestätigt" value={eur(data.commercial.ersteHaelfteBestaetigt)} />
              <KpiCell label="2. Hälfte bestätigt" value={eur(data.commercial.zweiteHaelfteBestaetigt)} />
              <KpiCell label="Offene Rückbehalte" value={eur(data.commercial.offeneRueckbehalte)} />
              <KpiCell label="Rücklage Soll/Ist" value={`${eur(data.commercial.ruecklageSoll)}`} hint={`Ist ${eur(data.commercial.ruecklageIst)}`} />
              <KpiCell label="Unterdeckung" value={eur(data.commercial.unterdeckung)} tone={data.commercial.unterdeckung > 0 ? 'text-red' : 'text-white'} />
            </TileCard>

            <TileCard title="Warnungen & Datenqualität" icon={<AlertIcon size={16} />}>
              <KpiCell label="Rot" value={String(data.warnings.rot)} tone="text-red" />
              <KpiCell label="Gelb" value={String(data.warnings.gelb)} tone="text-amber" />
              <KpiCell label="Info" value={String(data.warnings.info)} tone="text-brand-soft" />
              <KpiCell label="Gesperrte Verträge" value={String(data.dataQuality.gesperrteVertraege)} tone={data.dataQuality.gesperrteVertraege > 0 ? 'text-amber' : 'text-white'} />
              <KpiCell label="Offene DQ-Fehler" value={String(data.dataQuality.offeneFehler)} />
              <KpiCell label="Unbek. Verkäufer/Org" value={`${data.dataQuality.unbekannteVerkaeufer}/${data.dataQuality.unbekannteOrganisationen}`} />
            </TileCard>
          </>
        )}
      </div>

      {/* Real-time / forecast (I-30) */}
      {data?.realtime && (
        <div className="mb-6">
          <div className="rounded-xl bg-amber/10 border border-amber/30 px-4 py-2.5 mb-3 flex items-start gap-2">
            <AlertIcon size={15} />
            <span className="text-[12px] text-amber"><span className="font-semibold">Echtzeit — vorläufig.</span> {data.realtime.hinweis}</span>
          </div>
          <DataTable
            title="Live SWA-Stufen-Fortschritt pro Verkäufer (provisorisch)"
            rows={data.realtime.repTierProjektionen}
            emptyText="Keine Live-Projektion für diese Periode."
            columns={[
              { key: 'repId', header: 'Verkäufer', render: (r: any) => <span className="font-semibold text-ink">{r.repId.slice(0, 8)}</span> },
              { key: 'typ', header: 'Typ', render: (r: any) => (r.isPartner ? 'Partner' : 'Angestellt') },
              { key: 'qualifiedNewCount', header: 'Neukunden', align: 'right', render: (r: any) => r.qualifiedNewCount },
              { key: 'reachedRate', header: 'Satz (retro.)', align: 'right', render: (r: any) => eur(r.reachedRate) },
              { key: 'next', header: 'Bis nächste Stufe', align: 'right', render: (r: any) => (r.bisNaechsteStufe == null ? <span className="text-steel">Höchste</span> : <span>{r.bisNaechsteStufe} → {eur(r.nextRate)}</span>) },
              { key: 'potenzial', header: 'Potenzial', align: 'right', render: (r: any) => (r.potenzialNaechsteStufe == null ? '—' : <span className="text-green">+{eur(r.potenzialNaechsteStufe)}</span>) },
            ]}
          />
          {data.realtime.reversals.length > 0 && (
            <div className="mt-4">
              <DataTable
                title={`Stornos / Widerrufe seit letztem Sync — Auswirkung ${eur(data.realtime.reversalImpactGesamt)}`}
                rows={data.realtime.reversals}
                columns={[
                  { key: 'swaOrderNumber', header: 'Auftragsnr.', render: (r: any) => r.swaOrderNumber ?? r.contractId.slice(0, 8) },
                  { key: 'kunde', header: 'Kunde', render: (r: any) => r.kunde ?? '—' },
                  { key: 'status', header: 'Status', render: (r: any) => <span className="chip bg-red/10 text-red border-red/30">{r.status}</span> },
                  { key: 'finanzielleAuswirkung', header: 'Auswirkung', align: 'right', render: (r: any) => <span className="text-red tabular-nums">{eur(r.finanzielleAuswirkung)}</span> },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {/* Acceptance criteria (I-37, ch. 18) */}
      {akzeptanz && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-brand"><FileCheckIcon size={16} /></span>
              <h2 className="font-bold text-white text-sm">Akzeptanzkriterien Kap. 18 (I-37)</h2>
            </div>
            <span className={`chip ${akzeptanz.alleErfuellt ? 'bg-green/10 text-green border-green/30' : 'bg-amber/10 text-amber border-amber/30'}`}>
              {akzeptanz.erfuellt} / {akzeptanz.gesamt} erfüllt
            </span>
          </div>
          <div className="space-y-2">
            {akzeptanz.kriterien.map(k => (
              <div key={k.nr} className="flex items-start gap-3 rounded-lg bg-navy2/40 border border-line/60 px-3 py-2.5">
                <span className={`shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center ${k.erfuellt ? 'bg-green/15 text-green' : 'bg-red/15 text-red'}`}>
                  {k.erfuellt ? <CheckIcon size={12} /> : <AlertIcon size={12} />}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink">{k.nr}. {k.titel} <span className="text-[10px] text-steel font-normal">({k.ref})</span></div>
                  <div className="text-[11.5px] text-steel">{k.nachweis}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
