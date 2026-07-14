import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { AlertIcon, RefreshIcon } from '../components/icons';

interface RepTierProjection {
  repId: string;
  isPartner: boolean;
  qualifiedNewCount: number;
  reachedRate: number;
  nextThreshold: number | null;
  nextRate: number | null;
  bisNaechsteStufe: number | null;
  variableProvision: number;
  potenzialNaechsteStufe: number | null;
}

interface Reversal {
  contractId: string;
  swaOrderNumber: string | null;
  kunde: string | null;
  repId: string | null;
  status: string;
  finanzielleAuswirkung: number;
}

interface Forecast {
  periode: string;
  provisorisch: boolean;
  erstelltAm: string;
  hinweis: string;
  swaTier: {
    qualifizierteNeukunden: number;
    erreichteStufe: number;
    naechsteStufeAb: number | null;
    naechsteStufeSatz: number | null;
    erwartetGesamt: number;
    anzahlOffen: number;
    anzahlAbweichung: number;
  };
  repTierProjektionen: RepTierProjection[];
  repSummaries: { repId: string; auszahlung: number; auszahlungGesperrt?: boolean }[];
  totals: { faelligGesamt: number; rueckstellungGesamt: number; stornoEinbehaltGesamt: number };
  reversals: Reversal[];
  reversalImpactGesamt: number;
  warnungen: string[];
}

const eur = (n: number) => `€ ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function currentPeriode() {
  return new Date().toISOString().slice(0, 7);
}

export default function ForecastPage() {
  const [periode, setPeriode] = useState(currentPeriode());
  const [data, setData] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p: string) => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/forecast?periode=${encodeURIComponent(p)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Fehler beim Laden der Prognose.'))))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(periode); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <PageHeader
        kicker="Forecast"
        title="Live-Prognose (vorläufig)"
        subtitle="Laufende Projektion aus Live-Daten inkl. Staffel-Umschaltung und SWA-Stufe. Nichts ist zahlbar, bevor die SWA-Liste bestätigt (I-16, Fachkonzept 11.3)."
        actions={
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={periode}
              onChange={e => setPeriode(e.target.value)}
              className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink"
            />
            <button onClick={() => load(periode)} disabled={loading} className="btn-primary">
              <RefreshIcon size={15} />
              {loading ? 'Lädt…' : 'Aktualisieren'}
            </button>
          </div>
        }
      />

      <div className="rounded-xl bg-amber/10 border border-amber/30 px-4 py-3 mb-6 flex items-start gap-2">
        <AlertIcon size={16} />
        <div className="text-[12.5px] text-amber">
          <span className="font-semibold">Vorläufig — nicht zahlbar.</span>{' '}
          {data?.hinweis ?? 'Provisorische Projektion aus Live-Daten.'}
        </div>
      </div>

      {error && <p className="text-sm text-red mb-4">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Qualifizierte Neukunden', val: data?.swaTier.qualifizierteNeukunden ?? 0, cls: 'text-white' },
          { label: 'SWA-Stufe (erreicht)', val: data ? eur(data.swaTier.erreichteStufe) : '—', cls: 'text-brand-soft' },
          { label: 'Fällig (Projektion)', val: data ? eur(data.totals.faelligGesamt) : '—', cls: 'text-white' },
          {
            label: 'Storno-Auswirkung',
            val: data ? eur(data.reversalImpactGesamt) : '—',
            cls: (data?.reversalImpactGesamt ?? 0) < 0 ? 'text-red' : 'text-white',
          },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
            <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold">{s.label}</div>
            <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${s.cls}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {data && data.swaTier.naechsteStufeAb != null && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-white mb-1">Nächste SWA-Stufe</h2>
          <p className="text-steel2 text-sm">
            Noch{' '}
            <span className="font-semibold text-ink">
              {data.swaTier.naechsteStufeAb - data.swaTier.qualifizierteNeukunden}
            </span>{' '}
            qualifizierte Neukunden bis Stufe {eur(data.swaTier.naechsteStufeSatz ?? 0)} / Vertrag (ab{' '}
            {data.swaTier.naechsteStufeAb}).
          </p>
        </div>
      )}

      <DataTable
        title="Staffel-Projektion pro Verkäufer"
        rows={data?.repTierProjektionen ?? []}
        emptyText="Keine Projektion für diese Periode."
        columns={[
          { key: 'repId', header: 'Verkäufer', render: (r: any) => <span className="font-semibold text-ink">{r.repId.slice(0, 8)}</span> },
          { key: 'typ', header: 'Typ', render: (r: any) => (r.isPartner ? 'Partner' : 'Angestellt') },
          { key: 'qualifiedNewCount', header: 'Neukunden', align: 'right', render: (r: any) => r.qualifiedNewCount },
          { key: 'reachedRate', header: 'Satz (retro.)', align: 'right', render: (r: any) => eur(r.reachedRate) },
          {
            key: 'next',
            header: 'Bis nächste Stufe',
            align: 'right',
            render: (r: any) =>
              r.nextThreshold == null ? (
                <span className="text-steel">Höchste Stufe</span>
              ) : (
                <span>
                  {r.bisNaechsteStufe} → {eur(r.nextRate)}
                </span>
              ),
          },
          {
            key: 'potenzial',
            header: 'Potenzial',
            align: 'right',
            render: (r: any) => (r.potenzialNaechsteStufe == null ? '—' : <span className="text-green">+{eur(r.potenzialNaechsteStufe)}</span>),
          },
          { key: 'variableProvision', header: 'Projiziert', align: 'right', render: (r: any) => <span className="font-semibold tabular-nums">{eur(r.variableProvision)}</span> },
        ]}
      />

      {(data?.reversals.length ?? 0) > 0 && (
        <div className="mt-6">
          <DataTable
            title="Stornos / Widerrufe seit letztem Sync (Warnung)"
            rows={data?.reversals ?? []}
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
  );
}
