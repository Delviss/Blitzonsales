import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, apiDownload, formatEur, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';

interface Line {
  id: string;
  betrag: number;
  typ: string;
  begruendung: string | null;
  datencheck: boolean;
  contract?: { joulesId: string; kunde: string | null } | null;
  rep?: { name: string } | null;
}
interface RunDetail {
  run: { id: string; periode: string; status: string; organisation?: { name: string } | null };
  lines: Line[];
  summary: { gesamt: number; anzahlZeilen: number; anzahlDatencheck: number; proRep: { repId: string; name: string; summe: number }[] };
}

export default function ProvisionslaufDetailPage() {
  const { id } = useParams<{ id: string }>();
  const user = getUser();
  const isAdmin = user?.rolle === 'admin_gf';
  const canGenerate = isAdmin || user?.rolle === 'teamleiter' || user?.rolle === 'backoffice';
  const [data, setData] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch(`/api/provisionslaeufe/${id}`).then(r => r.json()).then(setData).catch(() => {});
  useEffect(() => { load(); }, [id]);

  const run = data?.run;

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e: any) { setError(e.message ?? 'Aktion fehlgeschlagen.'); }
    setBusy(false);
  };

  const handleGenerate = () => withBusy(async () => {
    const res = await apiFetch(`/api/provisionslaeufe/${id}/generate`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Neuberechnung fehlgeschlagen.');
    await load();
  });

  const handleFreigeben = () => withBusy(async () => {
    const res = await apiFetch(`/api/provisionslaeufe/${id}/freigeben`, { method: 'POST' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Freigabe fehlgeschlagen.');
    await load();
  });

  const handleExport = (kind: 'buchhaltung-csv' | 'buchhaltung-datev' | 'intern') => withBusy(async () => {
    if (kind === 'buchhaltung-csv') {
      await apiDownload(`/api/provisionslaeufe/${id}/export/buchhaltung?format=csv`, 'buchhaltung.csv');
    } else if (kind === 'buchhaltung-datev') {
      await apiDownload(`/api/provisionslaeufe/${id}/export/buchhaltung?format=datev`, 'buchhaltung-datev.csv');
    } else {
      await apiDownload(`/api/provisionslaeufe/${id}/export/intern`, 'provisionslauf.xlsx');
    }
  });

  const handlePdf = (repId: string) => withBusy(async () => {
    await apiDownload(`/api/provisionslaeufe/${id}/export/abrechnung/${repId}`, 'abrechnung.pdf');
  });

  if (!data || !run) return <div className="text-steel2">Lädt…</div>;

  return (
    <div>
      <Link to="/provisionslaeufe" className="text-[12px] text-steel2 hover:text-white">← Provisionsläufe</Link>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mt-3 mb-1">Provisionslauf</div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-extrabold">{run.periode}</h1>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
          run.status === 'freigegeben' ? 'bg-green/10 text-green border-green/30' : 'bg-amber/10 text-amber border-amber/30'
        }`}>{run.status === 'freigegeben' ? 'Freigegeben' : 'Entwurf'}</span>
        {run.organisation && <span className="text-steel2 text-sm">{run.organisation.name}</span>}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="text-[11px] text-steel uppercase tracking-wide">Zeilen</div>
          <div className="text-2xl font-extrabold mt-1 text-white">{data.summary.anzahlZeilen}</div>
        </div>
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="text-[11px] text-steel uppercase tracking-wide">Gesamtsumme</div>
          <div className="text-2xl font-extrabold mt-1 text-lime2">{formatEur(data.summary.gesamt)}</div>
        </div>
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="text-[11px] text-steel uppercase tracking-wide">Datencheck</div>
          <div className={`text-2xl font-extrabold mt-1 ${data.summary.anzahlDatencheck > 0 ? 'text-amber' : 'text-white'}`}>{data.summary.anzahlDatencheck}</div>
        </div>
        <div className="bg-panel border border-line rounded-xl p-4">
          <div className="text-[11px] text-steel uppercase tracking-wide">Verkäufer</div>
          <div className="text-2xl font-extrabold mt-1 text-white">{data.summary.proRep.length}</div>
        </div>
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center">
        {run.status === 'entwurf' && canGenerate && (
          <button disabled={busy} onClick={handleGenerate}
            className="bg-navy2 border border-line text-white font-semibold px-4 py-2 rounded-lg hover:border-lime transition-colors disabled:opacity-50">
            Neu berechnen
          </button>
        )}
        {run.status === 'entwurf' && isAdmin && (
          <button disabled={busy} onClick={handleFreigeben}
            className="bg-lime text-navy font-bold px-4 py-2 rounded-lg hover:bg-lime2 transition-colors disabled:opacity-50">
            Freigeben
          </button>
        )}
        {run.status === 'freigegeben' && (isAdmin || user?.rolle === 'backoffice') && (
          <>
            <button disabled={busy} onClick={() => handleExport('buchhaltung-csv')}
              className="bg-navy2 border border-line text-white font-semibold px-4 py-2 rounded-lg hover:border-lime transition-colors disabled:opacity-50">
              Buchhaltungsexport (CSV)
            </button>
            <button disabled={busy} onClick={() => handleExport('buchhaltung-datev')}
              className="bg-navy2 border border-line text-white font-semibold px-4 py-2 rounded-lg hover:border-lime transition-colors disabled:opacity-50"
              title="Platzhalter: echte DATEV-Spaltenspezifikation vom Steuerberater steht noch aus">
              DATEV-Export (Platzhalter)
            </button>
            <button disabled={busy} onClick={() => handleExport('intern')}
              className="bg-navy2 border border-line text-white font-semibold px-4 py-2 rounded-lg hover:border-lime transition-colors disabled:opacity-50">
              Interner Export (Excel)
            </button>
          </>
        )}
        {error && <span className="text-red text-sm">{error}</span>}
      </div>

      {data.summary.proRep.length > 0 && (
        <div className="mb-6 bg-panel border border-line rounded-xl p-4">
          <h2 className="font-bold text-white mb-3">Summe je Verkäufer</h2>
          <div className="flex gap-6 flex-wrap">
            {data.summary.proRep.map(r => (
              <div key={r.repId} className="text-sm flex items-center gap-2">
                <span className="text-steel2">{r.name}: </span>
                <span className="font-mono text-lime2 font-bold">{formatEur(r.summe)}</span>
                {run.status === 'freigegeben' && r.repId !== 'unbekannt' && (
                  <button disabled={busy} onClick={() => handlePdf(r.repId)}
                    className="text-[11px] text-steel hover:text-lime underline decoration-dotted">
                    Abrechnung (PDF)
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable<Line>
        rows={data.lines}
        columns={[
          { key: 'joulesId', header: 'Vertrag', render: r => <span className="font-mono text-lime2">{r.contract?.joulesId ?? '—'}</span> },
          { key: 'kunde', header: 'Kunde', render: r => r.contract?.kunde ?? '—' },
          { key: 'rep', header: 'Verkäufer', render: r => r.rep?.name ?? '—' },
          { key: 'typ', header: 'Typ', render: r => <span className={r.typ === 'clawback' ? 'text-red font-semibold' : 'text-steel2'}>{r.typ === 'clawback' ? 'Rückbuchung' : 'Normal'}</span> },
          { key: 'betrag', header: 'Betrag', render: r => <span className={`font-mono font-bold ${Number(r.betrag) < 0 ? 'text-red' : 'text-lime2'}`}>{formatEur(Number(r.betrag))}</span> },
          { key: 'datencheck', header: 'Datencheck', render: r => r.datencheck ? <span className="text-amber font-bold">Ja</span> : <span className="text-steel">Nein</span> },
          { key: 'begruendung', header: 'Begründung', render: r => <span className="text-steel2">{r.begruendung ?? '—'}</span> },
        ]}
      />
    </div>
  );
}
