import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, apiDownload, formatEur, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { RunStatusPill } from '../components/StatusPill';
import {
  ArrowLeftIcon, RefreshIcon, CheckIcon, DownloadIcon, FileTextIcon,
  EuroIcon, AlertIcon, UsersIcon, FileCheckIcon,
} from '../components/icons';

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

  if (!data || !run) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="skeleton h-8 w-56" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-24" />)}
        </div>
        <div className="skeleton h-64" />
      </div>
    );
  }

  return (
    <div>
      <Link
        to="/provisionslaeufe"
        className="inline-flex items-center gap-1.5 text-[12.5px] text-steel2 hover:text-white transition-colors mb-4"
      >
        <ArrowLeftIcon size={13} />
        Alle Provisionsläufe
      </Link>

      <div className="mb-8 animate-fade-up">
        <div className="kicker mb-1.5 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-gradient-to-r from-brand to-transparent" />
          Provisionslauf
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-white">{run.periode}</h1>
          <RunStatusPill status={run.status} />
          {run.organisation && <span className="text-steel2 text-sm">{run.organisation.name}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard label="Zeilen" value={data.summary.anzahlZeilen} icon={<FileCheckIcon size={17} />} tone="neutral" />
        <StatCard label="Gesamtsumme" value={formatEur(data.summary.gesamt)} icon={<EuroIcon size={17} />} tone="brand" />
        <StatCard
          label="Datencheck"
          value={data.summary.anzahlDatencheck}
          icon={<AlertIcon size={17} />}
          tone={data.summary.anzahlDatencheck > 0 ? 'warn' : 'neutral'}
          hint={data.summary.anzahlDatencheck > 0 ? 'Zeilen mit Prüfbedarf' : undefined}
        />
        <StatCard label="Verkäufer" value={data.summary.proRep.length} icon={<UsersIcon size={17} />} tone="neutral" />
      </div>

      <div className="flex gap-3 mb-6 flex-wrap items-center animate-fade-up">
        {run.status === 'entwurf' && canGenerate && (
          <button disabled={busy} onClick={handleGenerate} className="btn-ghost">
            <RefreshIcon size={15} className={busy ? 'animate-spin' : ''} />
            Neu berechnen
          </button>
        )}
        {run.status === 'entwurf' && isAdmin && (
          <button disabled={busy} onClick={handleFreigeben} className="btn-primary">
            <CheckIcon size={15} />
            Freigeben
          </button>
        )}
        {run.status === 'freigegeben' && (isAdmin || user?.rolle === 'backoffice') && (
          <>
            <button disabled={busy} onClick={() => handleExport('buchhaltung-csv')} className="btn-ghost">
              <DownloadIcon size={15} />
              Buchhaltungsexport (CSV)
            </button>
            <button
              disabled={busy}
              onClick={() => handleExport('buchhaltung-datev')}
              className="btn-ghost"
              title="Platzhalter: echte DATEV-Spaltenspezifikation vom Steuerberater steht noch aus"
            >
              <DownloadIcon size={15} />
              DATEV-Export (Platzhalter)
            </button>
            <button disabled={busy} onClick={() => handleExport('intern')} className="btn-ghost">
              <DownloadIcon size={15} />
              Interner Export (Excel)
            </button>
          </>
        )}
        {error && <span className="text-red text-sm animate-fade-in">{error}</span>}
      </div>

      {data.summary.proRep.length > 0 && (
        <div className="card p-5 mb-6 animate-fade-up">
          <h2 className="font-bold text-white text-sm mb-4">Summe je Verkäufer</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.summary.proRep.map(r => (
              <div
                key={r.repId}
                className="rounded-xl bg-navy2/60 border border-line px-4 py-3 flex items-center justify-between gap-3 transition-colors duration-200 hover:border-brand/40"
              >
                <div className="min-w-0">
                  <div className="text-[12.5px] font-semibold text-ink truncate">{r.name}</div>
                  <div className="font-mono text-brand-soft font-bold tabular-nums text-[15px]">{formatEur(r.summe)}</div>
                </div>
                {run.status === 'freigegeben' && r.repId !== 'unbekannt' && (
                  <button
                    disabled={busy}
                    onClick={() => handlePdf(r.repId)}
                    title="Abrechnung als PDF herunterladen"
                    className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold text-steel2 border border-line rounded-lg px-2.5 py-1.5 transition-all duration-200 hover:text-white hover:border-brand/50 disabled:opacity-50"
                  >
                    <FileTextIcon size={12} />
                    PDF
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <DataTable<Line>
        title="Provisionszeilen"
        rows={data.lines}
        emptyText="Dieser Lauf enthält noch keine Zeilen – ggf. zuerst neu berechnen."
        columns={[
          { key: 'joulesId', header: 'Vertrag', render: r => <span className="font-mono text-brand-soft">{r.contract?.joulesId ?? '—'}</span> },
          { key: 'kunde', header: 'Kunde', render: r => r.contract?.kunde ?? '—' },
          { key: 'rep', header: 'Verkäufer', render: r => <span className="text-ink font-medium">{r.rep?.name ?? '—'}</span> },
          {
            key: 'typ', header: 'Typ',
            render: r => r.typ === 'clawback'
              ? <span className="chip bg-red/10 text-red border-red/30">Rückbuchung</span>
              : <span className="text-steel2">Normal</span>,
          },
          {
            key: 'betrag', header: 'Betrag', align: 'right',
            render: r => (
              <span className={`font-mono font-bold ${Number(r.betrag) < 0 ? 'text-red' : 'text-brand-soft'}`}>
                {formatEur(Number(r.betrag))}
              </span>
            ),
          },
          {
            key: 'datencheck', header: 'Datencheck',
            render: r => r.datencheck
              ? <span className="chip bg-amber/10 text-amber border-amber/30">Ja</span>
              : <span className="text-steel">Nein</span>,
          },
          { key: 'begruendung', header: 'Begründung', render: r => r.begruendung ?? '—' },
        ]}
      />
    </div>
  );
}
