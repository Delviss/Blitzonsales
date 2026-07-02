import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';

interface Rep { id: string; name: string; iban: string | null; aktiv: boolean; organisation?: { name: string } | null; }

export default function VerkaeuferPage() {
  const [reps, setReps] = useState<Rep[]>([]);
  useEffect(() => { apiFetch('/api/verkaeufer').then(r => r.json()).then(setReps).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Verkäufer"
        subtitle="Außendienst mit Organisation, Auszahlungsdaten und Status."
      />
      <DataTable<Rep>
        title="Alle Verkäufer"
        rows={reps}
        columns={[
          { key: 'name', header: 'Name', render: r => <span className="font-semibold text-ink">{r.name}</span> },
          { key: 'organisation', header: 'Organisation', render: r => r.organisation?.name ?? '—' },
          { key: 'iban', header: 'IBAN', render: r => <span className="font-mono text-[11px]">{r.iban ?? '—'}</span> },
          {
            key: 'aktiv', header: 'Status',
            render: r => r.aktiv
              ? <span className="chip bg-green/10 text-green border-green/30"><span className="h-1.5 w-1.5 rounded-full bg-green" />Aktiv</span>
              : <span className="chip bg-red/10 text-red border-red/30"><span className="h-1.5 w-1.5 rounded-full bg-red" />Inaktiv</span>,
          },
        ]}
      />
    </div>
  );
}
