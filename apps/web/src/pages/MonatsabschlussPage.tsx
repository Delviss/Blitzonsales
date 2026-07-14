import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { AlertIcon, LockIcon } from '../components/icons';

interface MonthClose {
  id: string;
  periode: string;
  status: string;
  geschlossenAm: string | null;
  geschlossenVon: string | null;
  wiederGeoeffnetAm: string | null;
  reopenGrund: string | null;
}

function currentPeriode() {
  return new Date().toISOString().slice(0, 7);
}
const canOps = () => ['admin_gf', 'backoffice'].includes(getUser()?.rolle ?? '');
const isFounder = () => getUser()?.rolle === 'admin_gf';

export default function MonatsabschlussPage() {
  const [rows, setRows] = useState<MonthClose[]>([]);
  const [periode, setPeriode] = useState(currentPeriode());
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    apiFetch('/api/monatsabschluss').then(r => r.json()).then(setRows).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const close = async () => {
    setError(null); setMsg(null);
    try {
      const res = await apiFetch('/api/monatsabschluss', { method: 'POST', body: JSON.stringify({ periode }) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Abschluss fehlgeschlagen.');
      }
      setMsg(`Monat ${periode} abgeschlossen und eingefroren.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const reopen = async (p: string) => {
    const grund = window.prompt(`Monat ${p} wieder öffnen — Begründung (Pflicht):`);
    if (grund == null) return;
    setError(null); setMsg(null);
    try {
      const res = await apiFetch(`/api/monatsabschluss/${p}/reopen`, { method: 'POST', body: JSON.stringify({ grund }) });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Wiederöffnung fehlgeschlagen.');
      }
      setMsg(`Monat ${p} wieder geöffnet.`);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Governance"
        title="Monatsabschluss & Freeze"
        subtitle="Nach dem Abschluss sind Volumina, Staffeln, Auszahlungen und KPIs des Monats unveränderlich. Spätere SWA-Informationen erscheinen als Nachtrag im laufenden Monat (I-34, Fachkonzept 12.3/5.2)."
        actions={
          canOps() ? (
            <div className="flex items-center gap-2">
              <input
                type="month"
                value={periode}
                onChange={e => setPeriode(e.target.value)}
                className="rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink"
              />
              <button onClick={close} className="btn-primary">
                <LockIcon size={15} />
                Monat abschließen
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="rounded-xl bg-navy2/40 border border-line px-4 py-3 mb-6 flex items-start gap-2">
        <AlertIcon size={16} />
        <div className="text-[12.5px] text-steel2">
          Nur Founder/Admin dürfen einen abgeschlossenen Monat wieder öffnen; jede Wiederöffnung wird mit Grund protokolliert.
        </div>
      </div>

      {error && <p className="text-sm text-red mb-4">{error}</p>}
      {msg && <p className="text-sm text-green mb-4">{msg}</p>}

      <DataTable
        title="Abgeschlossene Monate"
        rows={rows}
        emptyText="Noch kein Monat abgeschlossen."
        columns={[
          { key: 'periode', header: 'Periode', render: (r: any) => <span className="font-semibold text-ink">{r.periode}</span> },
          {
            key: 'status',
            header: 'Status',
            render: (r: any) =>
              r.status === 'geschlossen' ? (
                <span className="chip bg-red/10 text-red border-red/30">Geschlossen</span>
              ) : (
                <span className="chip bg-green/10 text-green border-green/30">Offen</span>
              ),
          },
          { key: 'geschlossenAm', header: 'Abgeschlossen am', render: (r: any) => (r.geschlossenAm ? new Date(r.geschlossenAm).toLocaleString('de-DE') : '—') },
          { key: 'reopenGrund', header: 'Wiederöffnung', render: (r: any) => (r.reopenGrund ? <span className="text-[12px] text-amber">{r.reopenGrund}</span> : '—') },
          {
            key: 'aktion',
            header: '',
            align: 'right',
            render: (r: any) =>
              isFounder() && r.status === 'geschlossen' ? (
                <button onClick={() => reopen(r.periode)} className="text-[12.5px] text-brand-soft hover:underline">
                  Wieder öffnen
                </button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
