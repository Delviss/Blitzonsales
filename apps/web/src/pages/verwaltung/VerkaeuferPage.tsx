import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getUser } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';

interface Rep {
  id: string;
  name: string;
  iban: string | null;
  aktiv: boolean;
  rolle: string | null;
  grundgehalt: number | null;
  eintrittsdatum: string | null;
  austrittsdatum: string | null;
  trainerId: string | null;
  teamleadId: string | null;
  organisationId: string | null;
  organisation?: { name: string } | null;
}

interface Org { id: string; name: string; }

// I-04 role model / org master data (labels only; the values match RepRole).
const ROLLEN: { value: string; label: string }[] = [
  { value: 'sales', label: 'Vertrieb' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'team_lead', label: 'Teamleiter' },
  { value: 'site_lead', label: 'Standortleiter' },
];
const rolleLabel = (v: string | null) => ROLLEN.find(r => r.value === v)?.label ?? '—';

type Draft = Partial<Rep>;

/**
 * I-07 master-data admin UI: maintain the Verkäufer master data introduced in
 * I-04 — role, base salary (Fixum basis), active status and the directly-assigned
 * trainer / team-lead (I-19, no multi-level pyramid). Founder/Admin only; every
 * change is audited server-side.
 */
export default function VerkaeuferPage() {
  const user = getUser();
  const canEdit = user?.rolle === 'admin_gf';
  const [reps, setReps] = useState<Rep[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch('/api/verkaeufer').then(r => r.json()).then(setReps).catch(() => {});
  useEffect(() => {
    load();
    apiFetch('/api/organisationen').then(r => r.json()).then(setOrgs).catch(() => {});
  }, []);

  const repOptions = useMemo(() => reps.map(r => ({ id: r.id, name: r.name })), [reps]);

  const startCreate = () => { setError(null); setEditing({ aktiv: true, rolle: 'sales' }); };
  const startEdit = (r: Rep) => { setError(null); setEditing({ ...r }); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    const payload = {
      name: editing.name,
      iban: editing.iban || null,
      aktiv: editing.aktiv ?? true,
      rolle: editing.rolle || null,
      grundgehalt: editing.grundgehalt === undefined || editing.grundgehalt === null || (editing.grundgehalt as any) === '' ? null : Number(editing.grundgehalt),
      eintrittsdatum: editing.eintrittsdatum || null,
      austrittsdatum: editing.austrittsdatum || null,
      trainerId: editing.trainerId || null,
      teamleadId: editing.teamleadId || null,
      organisationId: editing.organisationId || null,
    };
    try {
      const res = editing.id
        ? await apiFetch(`/api/verkaeufer/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/api/verkaeufer', { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Speichern fehlgeschlagen.');
      setEditing(null);
      load();
    } catch (err: any) {
      setError(err.message ?? 'Speichern fehlgeschlagen.');
    }
  };

  const nameById = (id: string | null) => reps.find(r => r.id === id)?.name ?? '—';

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Verkäufer"
        subtitle="Rolle, Grundgehalt, Trainer-/Teamleiter-Zuordnung und Status pflegen (I-04)."
        actions={canEdit && !editing ? (
          <button className="btn-primary" onClick={startCreate}><PlusIcon size={15} />Verkäufer anlegen</button>
        ) : undefined}
      />

      {editing && (
        <form onSubmit={save} className="card p-5 mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-fade-up">
          <div className="lg:col-span-3 text-sm font-semibold text-ink">
            {editing.id ? 'Verkäufer bearbeiten' : 'Neuer Verkäufer'}
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input w-full" required value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Organisation</label>
            <select className="input w-full" value={editing.organisationId ?? ''} onChange={e => setEditing({ ...editing, organisationId: e.target.value || null })}>
              <option value="">— keine —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Rolle</label>
            <select className="input w-full" value={editing.rolle ?? ''} onChange={e => setEditing({ ...editing, rolle: e.target.value || null })}>
              <option value="">—</option>
              {ROLLEN.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Grundgehalt (Fixum-Basis, €)</label>
            <input type="number" step="0.01" className="input w-full" value={editing.grundgehalt ?? ''} onChange={e => setEditing({ ...editing, grundgehalt: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Trainer (direkt)</label>
            <select className="input w-full" value={editing.trainerId ?? ''} onChange={e => setEditing({ ...editing, trainerId: e.target.value || null })}>
              <option value="">— kein —</option>
              {repOptions.filter(o => o.id !== editing.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Teamleiter (direkt)</label>
            <select className="input w-full" value={editing.teamleadId ?? ''} onChange={e => setEditing({ ...editing, teamleadId: e.target.value || null })}>
              <option value="">— kein —</option>
              {repOptions.filter(o => o.id !== editing.id).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">IBAN</label>
            <input className="input w-full font-mono text-[12px]" value={editing.iban ?? ''} onChange={e => setEditing({ ...editing, iban: e.target.value })} />
          </div>
          <div>
            <label className="label">Eintrittsdatum</label>
            <input type="date" className="input w-full" value={editing.eintrittsdatum ?? ''} onChange={e => setEditing({ ...editing, eintrittsdatum: e.target.value || null })} />
          </div>
          <div>
            <label className="label">Austrittsdatum</label>
            <input type="date" className="input w-full" value={editing.austrittsdatum ?? ''} onChange={e => setEditing({ ...editing, austrittsdatum: e.target.value || null })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink self-end">
            <input type="checkbox" checked={editing.aktiv ?? true} onChange={e => setEditing({ ...editing, aktiv: e.target.checked })} />
            Aktiv
          </label>
          <div className="lg:col-span-3 flex items-center gap-3">
            <button type="submit" className="btn-primary">Speichern</button>
            <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Abbrechen</button>
            {error && <span className="text-sm text-red">{error}</span>}
          </div>
        </form>
      )}

      <DataTable<Rep>
        title="Alle Verkäufer"
        rows={reps}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? '—' },
          { key: 'rolle', header: 'Rolle', render: r => rolleLabel(r.rolle) },
          { key: 'grundgehalt', header: 'Grundgehalt', render: r => r.grundgehalt != null ? `${Number(r.grundgehalt).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €` : '—' },
          { key: 'trainerId', header: 'Trainer', render: r => nameById(r.trainerId) },
          { key: 'teamleadId', header: 'Teamleiter', render: r => nameById(r.teamleadId) },
          {
            key: 'aktiv', header: 'Status',
            render: r => r.aktiv
              ? <span className="chip bg-green/10 text-green border-green/30"><span className="h-1.5 w-1.5 rounded-full bg-green" />Aktiv</span>
              : <span className="chip bg-red/10 text-red border-red/30"><span className="h-1.5 w-1.5 rounded-full bg-red" />Inaktiv</span>,
          },
          ...(canEdit ? [{
            key: 'edit' as const, header: '', render: (r: Rep) => (
              <button className="btn-ghost text-xs" onClick={() => startEdit(r)}>Bearbeiten</button>
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
