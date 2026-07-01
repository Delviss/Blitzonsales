import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../../lib/auth';
import DataTable from '../../components/DataTable';

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
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Verwaltung</div>
      <h1 className="text-2xl font-extrabold mb-6">Provisionsregeln</h1>

      <DataTable<Rule>
        rows={rules}
        columns={[
          { key: 'typ', header: 'Regel', render: r => <span className="font-semibold text-white">{r.typ}</span> },
          { key: 'produkt', header: 'Produkt', render: r => r.produkt?.name ?? 'alle' },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? 'alle' },
          { key: 'satz', header: 'Satz', render: r => r.satz != null ? <span className="font-mono text-lime2">{Number(r.satz).toFixed(2)} €</span> : '—' },
          { key: 'gueltigAb', header: 'Gültig ab' },
          { key: 'gueltigBis', header: 'Gültig bis', render: r => r.gueltigBis ?? 'unbegrenzt' },
          ...(isAdmin ? [{
            key: 'actions', header: '', render: (r: Rule) => (
              <button onClick={() => handleDelete(r.id)} className="text-[11px] text-red hover:underline">Löschen</button>
            ),
          }] : []),
        ]}
      />

      {isAdmin && (
        <form onSubmit={handleCreate} className="mt-6 bg-panel border border-line rounded-xl p-5 flex gap-3 items-end flex-wrap">
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Regel-Bezeichnung</label>
            <input value={typ} onChange={e => setTyp(e.target.value)} required placeholder="Satz Strom Neukunde"
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Produkt</label>
            <select value={produktId} onChange={e => setProduktId(e.target.value)}
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime">
              <option value="">Alle Produkte</option>
              {produkte.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Organisation</label>
            <select value={organisationId} onChange={e => setOrganisationId(e.target.value)}
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime">
              <option value="">Alle Organisationen</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Satz (€)</label>
            <input value={satz} onChange={e => setSatz(e.target.value)} type="number" step="0.01" required
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white w-28 focus:outline-none focus:border-lime" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Gültig ab</label>
            <input value={gueltigAb} onChange={e => setGueltigAb(e.target.value)} type="date" required
              className="bg-navy border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-lime" />
          </div>
          <button type="submit" className="bg-lime text-navy font-bold px-4 py-2 rounded-lg hover:bg-lime2 transition-colors">Anlegen</button>
        </form>
      )}
    </div>
  );
}
