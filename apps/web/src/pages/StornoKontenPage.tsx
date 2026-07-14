import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { AlertIcon } from '../components/icons';

interface StornoAccount {
  repId: string;
  name: string;
  gesamtsaldo: number;
  privatAnteil: number;
  gewerbeAnteil: number;
  genutzteClawbacks: number;
  manuellFreigegeben: number;
  offeneForderungen: number;
  freiVerfuegbar: number;
}

const eur = (n: number) => `€ ${Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const canOps = () => ['admin_gf', 'backoffice'].includes(getUser()?.rolle ?? '');

export default function StornoKontenPage() {
  const [rows, setRows] = useState<StornoAccount[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // release dialog
  const [target, setTarget] = useState<StornoAccount | null>(null);
  const [betrag, setBetrag] = useState('');
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [genehmigtVon, setGenehmigtVon] = useState('');
  const [grund, setGrund] = useState('');

  const load = () => {
    apiFetch('/api/storno-konten').then(r => r.json()).then(setRows).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const openRelease = (r: StornoAccount) => {
    setTarget(r);
    setBetrag('');
    setDatum(new Date().toISOString().slice(0, 10));
    setGenehmigtVon(getUser()?.email ?? '');
    setGrund('');
    setError(null);
  };

  const submit = async () => {
    if (!target) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/storno-konten/${target.repId}/freigeben`, {
        method: 'POST',
        body: JSON.stringify({ betrag: Number(betrag), datum, genehmigtVon, grund }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Freigabe fehlgeschlagen.');
      }
      setMsg(`Freigabe über ${eur(Number(betrag))} für ${target.name} gebucht.`);
      setTarget(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Rücklagen"
        title="Stornokonten"
        subtitle="Storno-Guthaben wird nie automatisch ausgezahlt. Eine Teilfreigabe ist eine bewusste, vollständig auditierte Founder/Backoffice-Aktion mit Betrag, Datum, Genehmiger und Grund (I-26, Fachkonzept 7.5/10.1)."
      />

      <div className="rounded-xl bg-navy2/40 border border-line px-4 py-3 mb-6 flex items-start gap-2">
        <AlertIcon size={16} />
        <div className="text-[12.5px] text-steel2">
          Keine automatische Auszahlung von Storno-Guthaben. Bei inaktiven Mitarbeitern mit offenen Risiken sind
          Standard-Auszahlungen gesperrt — eine Überbrückung erfolgt ausschließlich über eine manuelle Freigabe.
        </div>
      </div>

      {msg && <p className="text-sm text-green mb-4 animate-fade-in">{msg}</p>}

      <DataTable
        title="Storno-Konten pro Verkäufer"
        rows={rows}
        emptyText="Keine Stornokonten."
        columns={[
          { key: 'name', header: 'Verkäufer', render: (r: any) => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'gesamtsaldo', header: 'Saldo', align: 'right', render: (r: any) => <span className="tabular-nums">{eur(r.gesamtsaldo)}</span> },
          { key: 'privatAnteil', header: 'Privat', align: 'right', render: (r: any) => eur(r.privatAnteil) },
          { key: 'gewerbeAnteil', header: 'Gewerbe', align: 'right', render: (r: any) => eur(r.gewerbeAnteil) },
          { key: 'offeneForderungen', header: 'Offene Forderungen', align: 'right', render: (r: any) => <span className={Number(r.offeneForderungen) > 0 ? 'text-amber' : ''}>{eur(r.offeneForderungen)}</span> },
          { key: 'manuellFreigegeben', header: 'Freigegeben', align: 'right', render: (r: any) => eur(r.manuellFreigegeben) },
          { key: 'freiVerfuegbar', header: 'Frei verfügbar', align: 'right', render: (r: any) => <span className="font-semibold text-brand-soft tabular-nums">{eur(r.freiVerfuegbar)}</span> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (r: any) =>
              canOps() ? (
                <button onClick={() => openRelease(r)} disabled={Number(r.gesamtsaldo) <= 0} className="text-[12px] font-semibold text-brand-soft hover:text-white disabled:text-steel disabled:no-underline underline underline-offset-2">
                  Freigeben
                </button>
              ) : null,
          },
        ]}
      />

      {target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setTarget(null)}>
          <div className="card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-white mb-1">Storno-Freigabe · {target.name}</h2>
            <p className="text-[12px] text-steel2 mb-4">Frei verfügbar: {eur(target.freiVerfuegbar)} · Saldo: {eur(target.gesamtsaldo)}</p>
            <div className="space-y-3">
              <label className="block text-[12px] text-steel2">
                Betrag (€)
                <input type="number" min="0" step="0.01" value={betrag} onChange={e => setBetrag(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
              </label>
              <label className="block text-[12px] text-steel2">
                Datum
                <input type="date" value={datum} onChange={e => setDatum(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
              </label>
              <label className="block text-[12px] text-steel2">
                Genehmigt durch
                <input value={genehmigtVon} onChange={e => setGenehmigtVon(e.target.value)} className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
              </label>
              <label className="block text-[12px] text-steel2">
                Grund (erforderlich)
                <textarea value={grund} onChange={e => setGrund(e.target.value)} rows={2} placeholder="z. B. Überbrückung Krankheit/Urlaub" className="mt-1 w-full rounded-lg bg-navy2/60 border border-line px-3 py-2 text-sm text-ink" />
              </label>
            </div>
            {error && <p className="text-sm text-red mt-3">{error}</p>}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button onClick={() => setTarget(null)} className="text-sm text-steel2 hover:text-white">Abbrechen</button>
              <button onClick={submit} disabled={!betrag || !grund.trim()} className="btn-primary">Freigeben</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
