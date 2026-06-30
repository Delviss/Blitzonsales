import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../../lib/auth';
import DataTable from '../../components/DataTable';

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
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Verwaltung</div>
      <h1 className="text-2xl font-extrabold mb-6">Organisationen</h1>

      <DataTable<Org>
        rows={orgs}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold text-white">{r.name}</span> },
          { key: 'typ', header: 'Typ' },
          { key: 'parentId', header: 'Parent-ID', render: r => <span className="font-mono text-[11px] text-steel">{r.parentId ?? '—'}</span> },
        ]}
      />

      {user?.rolle === 'admin_gf' && (
        <form onSubmit={handleCreate} className="mt-6 bg-panel border border-line rounded-xl p-5 flex gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} required
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Typ</label>
            <input value={newTyp} onChange={e => setNewTyp(e.target.value)} placeholder="team / root"
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime" />
          </div>
          <button type="submit" className="bg-lime text-navy font-bold px-4 py-2 rounded-lg hover:bg-lime2 transition-colors">Anlegen</button>
        </form>
      )}
    </div>
  );
}
