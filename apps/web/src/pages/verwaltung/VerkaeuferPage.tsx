import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import DataTable from '../../components/DataTable';

interface Rep { id: string; name: string; iban: string | null; aktiv: boolean; organisation?: { name: string } | null; }

export default function VerkaeuferPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  useEffect(() => { apiFetch('/api/verkaeufer').then(r => r.json()).then(setReps).catch(() => {}); }, []);

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Verwaltung</div>
      <h1 className="text-2xl font-extrabold mb-6">Verkäufer</h1>
      <DataTable<Rep>
        rows={reps}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold text-white">{r.name}</span> },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? '—' },
          { key: 'iban', header: 'IBAN', render: r => <span className="font-mono text-[11px]">{r.iban ?? '—'}</span> },
          { key: 'aktiv', header: 'Aktiv', render: r => <span className={r.aktiv ? 'text-green font-bold' : 'text-red font-bold'}>{r.aktiv ? 'Ja' : 'Nein'}</span> },
        ]}
      />
    </div>
  );
}
