import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, getUser } from '../lib/auth';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import { RunStatusPill } from '../components/StatusPill';
import { PlusIcon } from '../components/icons';

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
      <PageHeader
        kicker="Provisionierung"
        title="Provisionsläufe"
        subtitle="Monatliche Abrechnungsläufe anlegen, berechnen und freigeben."
      />

      {canCreate && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 flex gap-4 items-end flex-wrap animate-fade-up">
          <div>
            <label className="label">Periode (JJJJ-MM)</label>
            <input value={periode} onChange={e => setPeriode(e.target.value)} type="month" required className="input w-44" />
          </div>
          <div>
            <label className="label">Organisation</label>
            <select value={organisationId} onChange={e => setOrganisationId(e.target.value)} className="input w-56">
              <option value="">Alle Organisationen</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            <PlusIcon size={15} />
            Lauf anlegen
          </button>
          {error && <span className="text-red text-sm animate-fade-in">{error}</span>}
        </form>
      )}

      <DataTable<Run>
        title="Alle Läufe"
        rows={runs}
        emptyText="Noch keine Provisionsläufe angelegt."
        columns={[
          {
            key: 'periode', header: 'Periode', render: r => (
              <Link
                to={`/provisionslaeufe/${r.id}`}
                className="font-semibold text-brand-soft hover:text-white transition-colors underline-offset-4 hover:underline"
              >
                {r.periode}
              </Link>
            ),
          },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? 'Alle' },
          { key: 'status', header: 'Status', render: r => <RunStatusPill status={r.status} /> },
        ]}
      />
    </div>
  );
}
