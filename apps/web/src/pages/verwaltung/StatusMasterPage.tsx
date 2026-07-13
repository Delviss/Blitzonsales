import { useEffect, useState } from 'react';
import { apiFetch, getUser, formatDate } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';

interface StatusRow {
  id: string;
  code: string;
  bezeichnung: string;
  qualifiziert: boolean;
  kategorie: string | null;
  gueltigAb: string;
  quelle: string | null;
}

const KATEGORIEN = ['aktiv', 'pruefung', 'abgelehnt', 'clawback'];

/**
 * I-06/I-07 status master admin UI. The status master is the single source of
 * truth for which contract statuses qualify for the tier engine. Releases are
 * valid-from versioned — a new release inserts a new row (same code, later
 * gueltig_ab) rather than mutating history, so recomputing a closed month uses
 * the release valid then. Founder/Admin only; audited server-side.
 */
export default function StatusMasterPage() {
  const user = getUser();
  const canEdit = user?.rolle === 'admin_gf';
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    code: '', bezeichnung: '', qualifiziert: false, kategorie: 'aktiv',
    gueltigAb: new Date().toISOString().slice(0, 10),
  });

  const load = () => {
    const url = showAll ? '/api/status-master?all=1' : '/api/status-master';
    apiFetch(url).then(r => r.json()).then(setRows).catch(() => {});
  };
  useEffect(load, [showAll]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch('/api/status-master', { method: 'POST', body: JSON.stringify(draft) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Speichern fehlgeschlagen.');
      setCreating(false);
      setDraft({ code: '', bezeichnung: '', qualifiziert: false, kategorie: 'aktiv', gueltigAb: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err: any) {
      setError(err.message ?? 'Speichern fehlgeschlagen.');
    }
  };

  const seed = async () => {
    if (!confirm('Standard-Statusstammdaten einspielen (nur fehlende Codes)?')) return;
    await apiFetch('/api/status-master/seed', { method: 'POST' });
    load();
  };

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Statusstammdaten"
        subtitle="Freigabe qualifizierender Vertragsstatus für die Staffel-Engine (I-06, valid-from versioniert)."
        actions={canEdit ? (
          <div className="flex items-center gap-2">
            <button className="btn-ghost text-xs" onClick={seed}>Standard einspielen</button>
            {!creating && <button className="btn-primary" onClick={() => { setError(null); setCreating(true); }}><PlusIcon size={15} />Neue Freigabe</button>}
          </div>
        ) : undefined}
      />

      {creating && (
        <form onSubmit={create} className="card p-5 mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up">
          <div className="lg:col-span-3 text-sm font-semibold text-ink">Neue Status-Freigabe (neue Version)</div>
          <div>
            <label className="label">Code (Joules-Status)</label>
            <input className="input w-full" required value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value })} placeholder="z. B. In Belieferung" />
          </div>
          <div>
            <label className="label">Bezeichnung</label>
            <input className="input w-full" required value={draft.bezeichnung} onChange={e => setDraft({ ...draft, bezeichnung: e.target.value })} />
          </div>
          <div>
            <label className="label">Kategorie</label>
            <select className="input w-full" value={draft.kategorie} onChange={e => setDraft({ ...draft, kategorie: e.target.value })}>
              {KATEGORIEN.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Gültig ab</label>
            <input type="date" className="input w-full" required value={draft.gueltigAb} onChange={e => setDraft({ ...draft, gueltigAb: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink self-end">
            <input type="checkbox" checked={draft.qualifiziert} onChange={e => setDraft({ ...draft, qualifiziert: e.target.checked })} />
            Qualifiziert (zählt zur Staffel)
          </label>
          <div className="lg:col-span-3 flex items-center gap-3">
            <button type="submit" className="btn-primary">Freigabe speichern</button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Abbrechen</button>
            {error && <span className="text-sm text-red">{error}</span>}
          </div>
        </form>
      )}

      <label className="mb-4 flex items-center gap-2 text-sm text-steel2">
        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
        Alle Versionen anzeigen (statt der aktuell gültigen Auflösung)
      </label>

      <DataTable<StatusRow>
        title={showAll ? 'Alle Status-Versionen' : 'Aktuell gültige Statusstammdaten'}
        rows={rows}
        columns={[
          { key: 'code', header: 'Code', render: r => <span className="font-semibold text-ink">{r.code}</span> },
          { key: 'bezeichnung', header: 'Bezeichnung', render: r => r.bezeichnung },
          { key: 'kategorie', header: 'Kategorie', render: r => r.kategorie ?? '—' },
          {
            key: 'qualifiziert', header: 'Qualifiziert',
            render: r => r.qualifiziert
              ? <span className="chip bg-green/10 text-green border-green/30"><span className="h-1.5 w-1.5 rounded-full bg-green" />Ja</span>
              : <span className="chip bg-steel/10 text-steel border-steel/30"><span className="h-1.5 w-1.5 rounded-full bg-steel" />Nein</span>,
          },
          { key: 'gueltigAb', header: 'Gültig ab', render: r => formatDate(r.gueltigAb) },
          { key: 'quelle', header: 'Quelle', render: r => <span className="text-[11px] text-steel">{r.quelle ?? '—'}</span> },
        ]}
      />
    </div>
  );
}
