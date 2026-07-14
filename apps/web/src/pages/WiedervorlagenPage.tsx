import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { AlertIcon, CheckIcon, MailIcon } from '../components/icons';

interface Wiedervorlage {
  id: string;
  swaOrderNumber: string | null;
  kunde: string | null;
  vorvertragEnde: string | null;
  lieferStart: string | null;
  abgelehntAm: string | null;
  faelligAm: string;
  grund: string;
  status: string;
  emailGesendetAm: string | null;
}

interface IntakeResult {
  admissible: boolean;
  rejectionReason: string | null;
  deliveryStart: string | null;
  firstAdmissibleDate: string | null;
  leadDays: number | null;
}

const canOps = () => ['admin_gf', 'backoffice'].includes(getUser()?.rolle ?? '');

export default function WiedervorlagenPage() {
  const [rows, setRows] = useState<Wiedervorlage[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // intake-check form
  const [vorvertragEnde, setVorvertragEnde] = useState('');
  const [intakeDate, setIntakeDate] = useState(new Date().toISOString().slice(0, 10));
  const [kunde, setKunde] = useState('');
  const [swaOrderNumber, setSwaOrderNumber] = useState('');
  const [result, setResult] = useState<IntakeResult | null>(null);

  const load = () => {
    apiFetch('/api/wiedervorlagen').then(r => r.json()).then(setRows).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const check = async () => {
    setMsg(null);
    setResult(null);
    try {
      const res = await apiFetch('/api/intake/pruefen', {
        method: 'POST',
        body: JSON.stringify({ intakeDate, vorvertragEnde: vorvertragEnde || null, kunde: kunde || null, swaOrderNumber: swaOrderNumber || null }),
      });
      const body = await res.json();
      setResult(body);
      if (!body.admissible) setMsg(`Abgelehnt: "${body.rejectionReason}". Wiedervorlage für ${body.firstAdmissibleDate} angelegt.`);
      load();
    } catch {
      setMsg('Prüfung fehlgeschlagen.');
    }
  };

  const processDue = async () => {
    setMsg(null);
    try {
      const res = await apiFetch('/api/wiedervorlagen/prozess-faellige', { method: 'POST', body: JSON.stringify({}) });
      const body = await res.json();
      setMsg(`${body.gesendet} Benachrichtigung(en) versandt (${body.faellige} fällig).`);
      load();
    } catch {
      setMsg('Verarbeitung fehlgeschlagen.');
    }
  };

  const resolve = async (id: string) => {
    await apiFetch(`/api/wiedervorlagen/${id}/erledigt`, { method: 'POST', body: JSON.stringify({}) }).catch(() => {});
    load();
  };

  return (
    <div>
      <PageHeader
        kicker="CRM"
        title="Vorlaufzeit & Wiedervorlage"
        subtitle="Aufnahme-Prüfung gegen die Vorlaufzeit-Regel (≤ 365 Tage, konfigurierbar) und Wiedervorlagen mit Benachrichtigung am ersten zulässigen Tag (I-31/I-32)."
        actions={canOps() && <button onClick={processDue} className="btn-primary"><MailIcon size={15} />Fällige benachrichtigen</button>}
      />

      {canOps() && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-white mb-4">Aufnahme prüfen</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="text-[12px] text-steel2">
              Aufnahmedatum
              <input type="date" value={intakeDate} onChange={e => setIntakeDate(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            </label>
            <label className="text-[12px] text-steel2">
              Vorvertrag-Ende
              <input type="date" value={vorvertragEnde} onChange={e => setVorvertragEnde(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            </label>
            <label className="text-[12px] text-steel2">
              Kunde
              <input value={kunde} onChange={e => setKunde(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            </label>
            <label className="text-[12px] text-steel2">
              Auftragsnummer
              <input value={swaOrderNumber} onChange={e => setSwaOrderNumber(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={check} disabled={!vorvertragEnde} className="btn-primary">Prüfen</button>
            {result && (
              <span className={`text-[13px] flex items-center gap-1.5 ${result.admissible ? 'text-green' : 'text-red'}`}>
                {result.admissible ? <CheckIcon size={14} /> : <AlertIcon size={14} />}
                {result.admissible
                  ? `Aufnahme zulässig (${result.leadDays} Tage Vorlauf).`
                  : `${result.rejectionReason} — erster zulässiger Tag: ${result.firstAdmissibleDate}`}
              </span>
            )}
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-steel2 mb-4 animate-fade-in">{msg}</p>}

      <DataTable
        title="Wiedervorlagen"
        rows={rows}
        emptyText="Keine Wiedervorlagen."
        columns={[
          { key: 'kunde', header: 'Kunde', render: (r: any) => <span className="font-semibold text-ink">{r.kunde ?? r.swaOrderNumber ?? '—'}</span> },
          { key: 'vorvertragEnde', header: 'Vorvertrag-Ende', render: (r: any) => r.vorvertragEnde ?? '—' },
          { key: 'faelligAm', header: 'Fällig am (1. zulässiger Tag)', render: (r: any) => <span className="font-semibold text-brand-soft">{r.faelligAm}</span> },
          { key: 'grund', header: 'Grund' },
          {
            key: 'status',
            header: 'Status',
            render: (r: any) => {
              const cls = r.status === 'offen' ? 'bg-amber/10 text-amber border-amber/30'
                : r.status === 'benachrichtigt' ? 'bg-brand/10 text-brand-soft border-brand/30'
                : 'bg-green/10 text-green border-green/30';
              return <span className={`chip ${cls}`}>{r.status}</span>;
            },
          },
          { key: 'emailGesendetAm', header: 'E-Mail', render: (r: any) => (r.emailGesendetAm ? new Date(r.emailGesendetAm).toLocaleDateString('de-DE') : '—') },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r: any) =>
              canOps() && r.status !== 'erledigt' ? (
                <button onClick={() => resolve(r.id)} className="text-[12px] text-steel2 hover:text-white underline underline-offset-2">Erledigt</button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
