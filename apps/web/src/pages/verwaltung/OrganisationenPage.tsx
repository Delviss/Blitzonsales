import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';

interface Org {
  id: string;
  name: string;
  typ: string | null;
  parentId: string | null;
  orgTyp: string | null;
  partnerVerguetungsmodell: string | null;
}

// I-04 organisation type.
const ORG_TYPEN: { value: string; label: string }[] = [
  { value: 'blitzon_direct', label: 'BlitzON direkt' },
  { value: 'internal', label: 'Intern' },
  { value: 'partner', label: 'Partner' },
];
const orgTypLabel = (v: string | null) => ORG_TYPEN.find(o => o.value === v)?.label ?? '—';

type Draft = Partial<Org>;

/**
 * I-07 master-data admin UI: maintain the organisation master data from I-04 —
 * organisation type and, for partner organisations, the partner compensation
 * model. Founder/Admin only; audited server-side.
 */
export default function OrganisationenPage() {
  const user = getUser();
  const canEdit = user?.rolle === 'admin_gf';
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch('/api/organisationen').then(r => r.json()).then(setOrgs).catch(() => {});
  useEffect(() => { load(); }, []);

  const startCreate = () => { setError(null); setEditing({ orgTyp: 'blitzon_direct' }); };
  const startEdit = (o: Org) => { setError(null); setEditing({ ...o }); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    const payload = {
      name: editing.name,
      typ: editing.typ || null,
      parentId: editing.parentId || null,
      orgTyp: editing.orgTyp || null,
      partnerVerguetungsmodell: editing.orgTyp === 'partner' ? (editing.partnerVerguetungsmodell || null) : null,
    };
    try {
      const res = editing.id
        ? await apiFetch(`/api/organisationen/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/api/organisationen', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Speichern fehlgeschlagen.');
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err.message ?? 'Speichern fehlgeschlagen.');
    }
  };

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Organisationen"
        subtitle="Teams, Organisationstyp und Partner-Vergütungsmodell pflegen (I-04)."
        actions={canEdit && !editing ? (
          <button className="btn-primary" onClick={startCreate}><PlusIcon size={15} />Organisation anlegen</button>
        ) : undefined}
      />

      {editing && (
        <form onSubmit={save} className="card p-5 mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up">
          <div className="lg:col-span-3 text-sm font-semibold text-ink">
            {editing.id ? 'Organisation bearbeiten' : 'Neue Organisation'}
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input w-full" required value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="z. B. Team Nord" />
          </div>
          <div>
            <label className="label">Organisationstyp</label>
            <select className="input w-full" value={editing.orgTyp ?? ''} onChange={e => setEditing({ ...editing, orgTyp: e.target.value || null })}>
              <option value="">—</option>
              {ORG_TYPEN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Kurz-Typ (Freitext)</label>
            <input className="input w-full" value={editing.typ ?? ''} onChange={e => setEditing({ ...editing, typ: e.target.value })} placeholder="team / root" />
          </div>
          {editing.orgTyp === 'partner' && (
            <div className="md:col-span-2 lg:col-span-3">
              <label className="label">Partner-Vergütungsmodell</label>
              <input className="input w-full" value={editing.partnerVerguetungsmodell ?? ''} onChange={e => setEditing({ ...editing, partnerVerguetungsmodell: e.target.value })} placeholder="z. B. 35/35-Split, Referenz auf Vertragsmodell" />
            </div>
          )}
          <div className="lg:col-span-3 flex items-center gap-3">
            <button type="submit" className="btn-primary">Speichern</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Abbrechen</button>
            {error && <span className="text-sm text-red">{error}</span>}
          </div>
        </form>
      )}

      <DataTable<Org>
        title="Alle Organisationen"
        rows={orgs}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'orgTyp', header: 'Typ', render: r => orgTypLabel(r.orgTyp) },
          { key: 'partnerVerguetungsmodell', header: 'Partner-Modell', render: r => r.partnerVerguetungsmodell ?? '—' },
          { key: 'parentId', header: 'Übergeordnet', render: r => <span className="font-mono text-[11px] text-steel">{r.parentId ?? '—'}</span> },
          ...(canEdit ? [{
            key: 'edit' as const, header: '', render: (r: Org) => (
              <button className="btn-ghost text-xs" onClick={() => startEdit(r)}>Bearbeiten</button>
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
