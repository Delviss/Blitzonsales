import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { PlusIcon } from '../../components/icons';

interface Rule {
  id: string;
  typ: string;
  satz: number | null;
  gueltigAb: string;
  gueltigBis: string | null;
  organisation?: { name: string } | null;
  produkt?: { name: string } | null;
}
interface Organisation { id: string; name: string; }
interface Produkt { id: string; name: string; }

export default function ProvisionsregelnPage() {
  const user = getUser();
  const isAdmin = user?.rolle === 'admin_gf';
  const [rules, setRules] = useState<Rule[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [produkte, setProdukte] = useState<Produkt[]>([]);

  const [typ, setTyp] = useState('');
  const [satz, setSatz] = useState('');
  const [gueltigAb, setGueltigAb] = useState('');
  const [organisationId, setOrganisationId] = useState('');
  const [produktId, setProduktId] = useState('');

  const load = () => apiFetch('/api/provisionsregeln').then(r => r.json()).then(setRules).catch(() => {});

  useEffect(() => {
    load();
    apiFetch('/api/organisationen').then(r => r.json()).then(setOrgs).catch(() => {});
    apiFetch('/api/produkte').then(r => r.json()).then(setProdukte).catch(() => {});
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/provisionsregeln', {
      method: 'POST',
      body: JSON.stringify({
        typ,
        satz: satz ? Number(satz) : null,
        gueltigAb,
        organisationId: organisationId || null,
        produktId: produktId || null,
        bedingung: {},
      }),
    });
    setTyp(''); setSatz(''); setGueltigAb(''); setOrganisationId(''); setProduktId('');
    load();
  };

  const handleDelete = async (id: string) => {
    await apiFetch(`/api/provisionsregeln/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Provisionsregeln"
        subtitle="Sätze je Produkt und Organisation mit Gültigkeitszeitraum."
      />

      {isAdmin && (
        <form onSubmit={handleCreate} className="card p-5 mb-6 flex gap-4 items-end flex-wrap animate-fade-up">
          <div>
            <label className="label">Regel-Bezeichnung</label>
            <input value={typ} onChange={e => setTyp(e.target.value)} required placeholder="Satz Strom Neukunde" className="input w-56" />
          </div>
          <div>
            <label className="label">Produkt</label>
            <select value={produktId} onChange={e => setProduktId(e.target.value)} className="input w-48">
              <option value="">Alle Produkte</option>
              {produkte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Organisation</label>
            <select value={organisationId} onChange={e => setOrganisationId(e.target.value)} className="input w-48">
              <option value="">Alle Organisationen</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Satz (€)</label>
            <input value={satz} onChange={e => setSatz(e.target.value)} type="number" step="0.01" required className="input w-28" />
          </div>
          <div>
            <label className="label">Gültig ab</label>
            <input value={gueltigAb} onChange={e => setGueltigAb(e.target.value)} type="date" required className="input w-40" />
          </div>
          <button type="submit" className="btn-primary">
            <PlusIcon size={15} />
            Anlegen
          </button>
        </form>
      )}

      <DataTable<Rule>
        title="Alle Regeln"
        rows={rules}
        emptyText="Noch keine Provisionsregeln definiert."
        columns={[
          { key: 'typ', header: 'Regel', render: r => <span className="font-semibold text-ink">{r.typ}</span> },
          { key: 'produkt', header: 'Produkt', render: r => r.produkt?.name ?? 'Alle' },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? 'Alle' },
          {
            key: 'satz', header: 'Satz', align: 'right',
            render: r => r.satz != null
              ? <span className="font-mono text-brand-soft font-bold">{Number(r.satz).toFixed(2)} €</span>
              : '—',
          },
          { key: 'gueltigAb', header: 'Gültig ab' },
          { key: 'gueltigBis', header: 'Gültig bis', render: r => r.gueltigBis ?? 'Unbegrenzt' },
          ...(isAdmin ? [{
            key: 'actions', header: '', render: (r: Rule) => (
              <button
                onClick={() => handleDelete(r.id)}
                className="text-[11.5px] font-semibold text-steel hover:text-red transition-colors"
              >
                Löschen
              </button>
            ),
          }] : []),
        ]}
      />
    </div>
  );
}
