import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { AlertIcon, RefreshIcon } from '../components/icons';

type WarningLevel = 'rot' | 'gelb' | 'info';

interface Warning {
  level: WarningLevel;
  code: string;
  kategorie: string;
  titel: string;
  beschreibung: string;
  aktion: string;
  referenzTyp: string | null;
  referenzId: string | null;
  betrag?: number | null;
}

interface WarningsResult {
  periode: string;
  counts: { rot: number; gelb: number; info: number; gesamt: number };
  warnings: Warning[];
}

const eur = (n: number) => `€ ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function currentPeriode() {
  return new Date().toISOString().slice(0, 7);
}

const LEVEL_CHIP: Record<WarningLevel, string> = {
  rot: 'bg-red/10 text-red border-red/30',
  gelb: 'bg-amber/10 text-amber border-amber/30',
  info: 'bg-brand/10 text-brand-soft border-brand/30',
};
const LEVEL_LABEL: Record<WarningLevel, string> = { rot: 'Rot', gelb: 'Gelb', info: 'Info' };

export default function WarnungenPage() {
  const [periode, setPeriode] = useState(currentPeriode());
  const [data, setData] = useState<WarningsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p: string) => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/warnungen?periode=${encodeURIComponent(p)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Fehler beim Laden der Prüfungen.'))))
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(periode); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <PageHeader
        kicker="Prüfungen"
        title="Warnungen & Prüfsystem"
        subtitle="Rot/Gelb/Info-Prüfungen für den Founder (I-35, Fachkonzept Kap. 13). Jede Prüfung nennt die erwartete Aktion."
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

      {error && <p className="text-sm text-red mb-4">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Rot (blockierend)', val: data?.counts.rot ?? 0, cls: 'text-red' },
          { label: 'Gelb (beobachten)', val: data?.counts.gelb ?? 0, cls: 'text-amber' },
          { label: 'Info', val: data?.counts.info ?? 0, cls: 'text-brand-soft' },
          { label: 'Gesamt', val: data?.counts.gesamt ?? 0, cls: 'text-white' },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
            <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold">{s.label}</div>
            <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${s.cls}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {data && data.counts.gesamt === 0 && (
        <div className="rounded-xl bg-green/10 border border-green/30 px-4 py-3 mb-6 flex items-start gap-2">
          <AlertIcon size={16} />
          <div className="text-[12.5px] text-green">Keine offenen Prüfungen für diese Periode.</div>
        </div>
      )}

      <DataTable
        title="Prüfungen (Rot vor Gelb vor Info)"
        rows={data?.warnings ?? []}
        emptyText="Keine Warnungen für diese Periode."
        columns={[
          {
            key: 'level',
            header: 'Stufe',
            render: (r: any) => <span className={`chip ${LEVEL_CHIP[r.level as WarningLevel]}`}>{LEVEL_LABEL[r.level as WarningLevel]}</span>,
          },
          { key: 'kategorie', header: 'Kategorie', render: (r: any) => <span className="text-steel2">{r.kategorie}</span> },
          {
            key: 'titel',
            header: 'Prüfung',
            render: (r: any) => (
              <div>
                <div className="font-semibold text-ink">{r.titel}</div>
                <div className="text-[12px] text-steel">{r.beschreibung}</div>
              </div>
            ),
          },
          { key: 'aktion', header: 'Erwartete Aktion', render: (r: any) => <span className="text-[12.5px] text-ink">{r.aktion}</span> },
          {
            key: 'betrag',
            header: 'Betrag',
            align: 'right',
            render: (r: any) => (r.betrag == null ? '—' : <span className="tabular-nums">{eur(r.betrag)}</span>),
          },
        ]}
      />
    </div>
  );
}
