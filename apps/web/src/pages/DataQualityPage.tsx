import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { RefreshIcon, AlertIcon, CheckIcon } from '../components/icons';

interface DataQuality {
  letzteSynchronisierung: {
    status: string;
    gestartetAm: string;
    beendetAm: string | null;
    verarbeitet: number;
    erstellt: number;
    aktualisiert: number;
    fehler: number;
    meldung: string | null;
  } | null;
  offeneFehler: number;
  gesperrteVertraege: number;
  fehlerNachKategorie: Record<string, number>;
  unbekannteVerkaeufer: string[];
  unbekannteOrganisationen: string[];
  nichtZuordenbareAuftraege: { swaOrderNumber: string | null; joulesId: string | null; grund: string }[];
  fehlerZeilen: {
    id: string;
    quelle: string;
    swaOrderNumber: string | null;
    repName: string | null;
    kategorie: string;
    grund: string;
    createdAt: string;
  }[];
}

const KATEGORIE_LABEL: Record<string, string> = {
  order_number_missing: 'Auftragsnummer fehlt',
  unknown_rep: 'Unbekannter Verkäufer',
  unknown_org: 'Unbekannte Organisation',
  commercial_term_missing: 'Gewerbe-Laufzeit fehlt',
  surcharge_invalid: 'Aufschlag ungültig',
  status_invalid: 'Status ungültig',
  swa_unverifiable: 'SWA nicht verifizierbar',
  unassignable: 'Nicht zuordenbar',
};

export default function DataQualityPage() {
  const [data, setData] = useState<DataQuality | null>(null);
  const [syncConfigured, setSyncConfigured] = useState<boolean | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canSync = ['admin_gf', 'backoffice'].includes(getUser()?.rolle ?? '');

  const load = () => {
    apiFetch('/api/data-quality').then(r => r.json()).then(setData).catch(() => {});
    apiFetch('/api/sync/status').then(r => r.json()).then(s => setSyncConfigured(s.konfiguriert)).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const runSync = async () => {
    setSyncing(true); setMsg(null);
    try {
      const res = await apiFetch('/api/sync/joules', { method: 'POST', body: JSON.stringify({}) });
      const body = await res.json();
      setMsg(body.status === 'nicht_konfiguriert'
        ? 'Joules-API ist nicht konfiguriert — Ingestion läuft über den Excel-Import (I-12).'
        : `Sync abgeschlossen: ${body.verarbeitet} verarbeitet, ${body.erstellt} neu, ${body.aktualisiert} aktualisiert.`);
      load();
    } catch {
      setMsg('Sync fehlgeschlagen.');
    }
    setSyncing(false);
  };

  const kategorien = Object.entries(data?.fehlerNachKategorie ?? {});

  return (
    <div>
      <PageHeader
        kicker="Datenqualität"
        title="Datenqualität & Synchronisierung"
        subtitle="Letzte Synchronisierung, gesperrte Verträge und die Fehlerliste aus API- und Datei-Ingestion (I-09/I-11)."
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Offene Fehler', val: data?.offeneFehler ?? 0, cls: (data?.offeneFehler ?? 0) ? 'text-amber' : 'text-white' },
          { label: 'Gesperrte Verträge', val: data?.gesperrteVertraege ?? 0, cls: (data?.gesperrteVertraege ?? 0) ? 'text-red' : 'text-white' },
          { label: 'Unbekannte Verkäufer', val: data?.unbekannteVerkaeufer.length ?? 0, cls: 'text-brand-soft' },
          { label: 'Nicht zuordenbar', val: data?.nichtZuordenbareAuftraege.length ?? 0, cls: 'text-brand-soft' },
        ].map(s => (
          <div key={s.label} className="rounded-xl bg-navy2/60 border border-line px-4 py-3">
            <div className="text-[10.5px] text-steel uppercase tracking-wider font-semibold">{s.label}</div>
            <div className={`text-xl font-extrabold tabular-nums mt-0.5 ${s.cls}`}>{s.val}</div>
          </div>
        ))}
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-white mb-1">Letzte Synchronisierung (Joules/SWA)</h2>
            {data?.letzteSynchronisierung ? (
              <p className="text-steel2 text-sm">
                {new Date(data.letzteSynchronisierung.gestartetAm).toLocaleString('de-DE')} · Status{' '}
                <span className="font-semibold text-ink">{data.letzteSynchronisierung.status}</span>
                {data.letzteSynchronisierung.meldung ? ` · ${data.letzteSynchronisierung.meldung}` : ''}
              </p>
            ) : (
              <p className="text-steel text-sm">Noch keine Synchronisierung ausgeführt.</p>
            )}
            {syncConfigured === false && (
              <p className="text-[12px] text-amber mt-1.5 flex items-center gap-1.5">
                <AlertIcon size={13} /> Joules-API nicht konfiguriert – Excel-Import ist die Zwischenquelle (I-08 extern blockiert).
              </p>
            )}
            {syncConfigured === true && (
              <p className="text-[12px] text-green mt-1.5 flex items-center gap-1.5">
                <CheckIcon size={13} /> Joules-API konfiguriert.
              </p>
            )}
          </div>
          {canSync && (
            <button onClick={runSync} disabled={syncing} className="btn-primary">
              <RefreshIcon size={15} />
              {syncing ? 'Synchronisiere…' : 'Jetzt synchronisieren'}
            </button>
          )}
        </div>
        {msg && <p className="text-sm text-steel2 mt-3 animate-fade-in">{msg}</p>}
      </div>

      {kategorien.length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-white mb-4">Fehler nach Kategorie</h2>
          <div className="flex flex-wrap gap-2">
            {kategorien.map(([k, n]) => (
              <span key={k} className="chip bg-amber/10 text-amber border-amber/30">
                {KATEGORIE_LABEL[k] ?? k}: {n}
              </span>
            ))}
          </div>
        </div>
      )}

      <DataTable
        title="Fehlerliste"
        rows={data?.fehlerZeilen ?? []}
        columns={[
          { key: 'swaOrderNumber', header: 'Auftragsnr.', render: (r: any) => <span className="font-semibold text-ink">{r.swaOrderNumber ?? r.joulesId ?? '—'}</span> },
          { key: 'quelle', header: 'Quelle', render: (r: any) => (r.quelle === 'api' ? 'API' : 'Datei') },
          { key: 'repName', header: 'Verkäufer', render: (r: any) => r.repName ?? '—' },
          { key: 'kategorie', header: 'Kategorie', render: (r: any) => KATEGORIE_LABEL[r.kategorie] ?? r.kategorie },
          { key: 'grund', header: 'Grund' },
          { key: 'createdAt', header: 'Erfasst', render: (r: any) => new Date(r.createdAt).toLocaleString('de-DE') },
        ]}
      />
    </div>
  );
}
