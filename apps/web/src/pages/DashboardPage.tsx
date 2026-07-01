import { useEffect, useState } from 'react';
import { apiFetch, getUser } from '../lib/auth';
import StatusPill from '../components/StatusPill';

interface Contract {
  id: string;
  joulesId: string;
  status: string;
  kunde: string | null;
  rep?: { name: string };
  produkt?: { name: string };
}
interface Run { id: string; status: string; }

export default function DashboardPage() {
  const user = getUser();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    apiFetch('/api/vertraege')
      .then(r => r.json())
      .then(setContracts)
      .catch(() => {});
    apiFetch('/api/provisionslaeufe')
      .then(r => r.json())
      .then(setRuns)
      .catch(() => {});
  }, []);

  const valid = contracts.filter(c =>
    ['Liefertermin steht fest', 'In Belieferung', 'Im Wechsel', 'Exportiert'].includes(c.status)
  ).length;
  const widerruf = contracts.filter(c => ['Widerruf', 'Storno'].includes(c.status)).length;

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Dashboard</div>
      <h1 className="text-3xl font-extrabold mb-1">Übersicht</h1>
      <p className="text-steel2 mb-8">Willkommen, {user?.email}</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Verträge gesamt', val: contracts.length },
          { label: 'Verträge gültig', val: valid },
          { label: 'Widerruf / Storno', val: widerruf, warn: widerruf > 0 },
          { label: 'Aktive Läufe', val: runs.filter(r => r.status === 'entwurf').length },
        ].map(kpi => (
          <div key={kpi.label} className="bg-panel border border-line rounded-xl p-4">
            <div className="text-[11px] text-steel uppercase tracking-wide">{kpi.label}</div>
            <div className={`text-3xl font-extrabold mt-1 ${kpi.warn ? 'text-red' : 'text-white'}`}>{kpi.val}</div>
          </div>
        ))}
      </div>

      <div className="bg-panel border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-white">Letzte Verträge</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr>
                {['Joules ID', 'Verkäufer', 'Produkt', 'Status', 'Kunde'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 bg-navy2 text-steel2 font-semibold text-[11px] uppercase tracking-wide border-b border-line">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.slice(0, 20).map((c, i) => (
                <tr key={c.id} className={i % 2 === 0 ? 'bg-panel' : 'bg-navy2/40'}>
                  <td className="px-4 py-2.5 font-mono text-lime2 border-b border-line/30">{c.joulesId}</td>
                  <td className="px-4 py-2.5 border-b border-line/30 text-white">{c.rep?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 border-b border-line/30 text-steel2">{c.produkt?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 border-b border-line/30"><StatusPill status={c.status} /></td>
                  <td className="px-4 py-2.5 border-b border-line/30 text-steel2">{c.kunde ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
