import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';

interface Run {
  id: string;
  periode: string;
  status: string;
  organisation?: { name: string } | null;
}
interface Organisation { id: string; name: string; }

export default function ProvisionslaeufePage() {
  const user = getUser();
  const canCreate = user?.rolle === 'admin_gf' || user?.rolle === 'teamleiter';
  const [runs, setRuns] = useState<Run[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [periode, setPeriode] = useState('');
  const [organisationId, setOrganisationId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => apiFetch('/api/provisionslaeufe').then(r => r.json()).then(setRuns).catch(() => {});

  useEffect(() => {
    load();
    apiFetch('/api/organisationen').then(r => r.json()).then(setOrgs).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await apiFetch('/api/provisionslaeufe', {
      method: 'POST',
      body: JSON.stringify({ periode, organisationId: organisationId || undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.message ?? 'Anlegen fehlgeschlagen.');
      return;
    }
    setPeriode(''); setOrganisationId('');
    load();
  };

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Provisionierung</div>
      <h1 className="text-2xl font-extrabold mb-6">Provisionsläufe</h1>

      <DataTable<Run>
        rows={runs}
        columns={[
          {
            key: 'periode', header: 'Periode', render: r => (
              <Link to={`/provisionslaeufe/${r.id}`} className="font-semibold text-lime2 hover:underline">{r.periode}</Link>
            ),
          },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? 'alle' },
          {
            key: 'status', header: 'Status', render: r => (
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                r.status === 'freigegeben' ? 'bg-green/10 text-green border-green/30' : 'bg-amber/10 text-amber border-amber/30'
              }`}>{r.status === 'freigegeben' ? 'Freigegeben' : 'Entwurf'}</span>
            ),
          },
        ]}
      />

      {canCreate && (
        <form onSubmit={handleCreate} className="mt-6 bg-panel border border-line rounded-xl p-5 flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Periode (JJJJ-MM)</label>
            <input value={periode} onChange={e => setPeriode(e.target.value)} type="month" required
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Organisation</label>
            <select value={organisationId} onChange={e => setOrganisationId(e.target.value)}
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime">
              <option value="">Alle Organisationen</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <button type="submit" className="bg-lime text-navy font-bold px-4 py-2 rounded-lg hover:bg-lime2 transition-colors">Lauf anlegen</button>
          {error && <span className="text-red text-sm">{error}</span>}
        </form>
      )}
    </div>
  );
}
