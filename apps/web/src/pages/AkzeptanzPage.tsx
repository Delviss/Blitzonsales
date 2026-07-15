import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/auth';
import PageHeader from '../components/PageHeader';
import { CheckIcon, AlertIcon, RefreshIcon } from '../components/icons';

interface Criterion { id: number; kapitel: string; titel: string; issues: string; erfuellt: boolean }
interface Result { periode: string; hinweis: string; kriterien: Criterion[]; erfuellt: number; gesamt: number; alleErfuellt: boolean }

const currentPeriode = () => new Date().toISOString().slice(0, 7);

export default function AkzeptanzPage() {
  const [periode, setPeriode] = useState(currentPeriode());
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p: string) => {
    setLoading(true); setError(null);
    apiFetch(`/api/akzeptanz?periode=${encodeURIComponent(p)}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('Fehler beim Laden der Akzeptanzprüfung.'))))
      .then(setData).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(periode); /* eslint-disable-next-line */ }, []);

  return (
    <div>
      <PageHeader
        kicker="Release-Gate"
        title="Akzeptanzkriterien (Fachkonzept 18)"
        subtitle="Die 11 Abnahmekriterien der Phase 1 mit Live-Status (I-37)."
        actions={
          <div className="flex items-center gap-2">
            <input type="month" value={periode} onChange={e => setPeriode(e.target.value)} className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            <button onClick={() => load(periode)} disabled={loading} className="btn-primary"><RefreshIcon size={15} />{loading ? 'Lädt…' : 'Prüfen'}</button>
          </div>
        }
      />

      {error && <p className="text-sm text-red mb-4">{error}</p>}

      {data && (
        <div className={`rounded-xl px-5 py-4 mb-6 flex items-center gap-3 border ${data.alleErfuellt ? 'bg-green/10 border-green/30' : 'bg-amber/10 border-amber/30'}`}>
          {data.alleErfuellt ? <CheckIcon size={20} /> : <AlertIcon size={20} />}
          <div>
            <div className={`font-bold ${data.alleErfuellt ? 'text-green' : 'text-amber'}`}>
              {data.erfuellt} / {data.gesamt} Kriterien erfüllt {data.alleErfuellt ? '— Phase 1 abnahmebereit' : '— offene Punkte'}
            </div>
            <div className="text-[12px] text-steel2 mt-0.5 max-w-2xl">{data.hinweis}</div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(data?.kriterien ?? []).map(k => (
          <div key={k.id} className="card px-5 py-3.5 flex items-center gap-4">
            <div className={`shrink-0 h-8 w-8 rounded-lg flex items-center justify-center border ${k.erfuellt ? 'text-green bg-green/10 border-green/25' : 'text-red bg-red/10 border-red/25'}`}>
              {k.erfuellt ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-semibold text-sm">{k.titel}</div>
              <div className="text-[11px] text-steel mt-0.5">Fachkonzept {k.kapitel} · {k.issues}</div>
            </div>
            <span className={`chip ${k.erfuellt ? 'bg-green/10 text-green border-green/30' : 'bg-red/10 text-red border-red/30'}`}>
              {k.erfuellt ? 'erfüllt' : 'offen'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
