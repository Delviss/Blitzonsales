import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';

interface Org { id: string; name: string; typ: string | null; parentId: string | null; }

export default function OrganisationenPage() {
  const user = getUser();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [newName, setNewName] = useState('');
  const [newTyp, setNewTyp] = useState('');

  const load = () => apiFetch('/api/organisationen').then(r => r.json()).then(setOrgs).catch(() => {});
  useEffect(() => { load(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/organisationen', { method: 'POST', body: JSON.stringify({ name: newName, typ: newTyp || null }) });
    setNewName(''); setNewTyp('');
    load();
  };

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Organisationen"
        subtitle="Teams und Vertriebsstrukturen der BlitzON Consulting."
      />

      {user?.rolle === 'admin_gf' && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 flex gap-4 items-end flex-wrap animate-fade-up">
          <div>
            <label className="label">Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} required placeholder="z. B. Team Nord" className="input w-56" />
          </div>
          <div>
            <label className="label">Typ</label>
            <input value={newTyp} onChange={e => setNewTyp(e.target.value)} placeholder="team / root" className="input w-44" />
          </div>
          <button type="submit" className="btn-primary">
            <PlusIcon size={15} />
            Anlegen
          </button>
        </form>
      )}

      <DataTable<Org>
        title="Alle Organisationen"
        rows={orgs}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'typ', header: 'Typ', render: r => r.typ ?? '—' },
          { key: 'parentId', header: 'Übergeordnet', render: r => <span className="font-mono text-[11px] text-steel">{r.parentId ?? '—'}</span> },
        ]}
      />
    </div>
  );
}
