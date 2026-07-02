import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';

interface Produkt { id: string; name: string; energie: string; bestand: boolean; }

const energieCls: Record<string, string> = {
  strom: 'bg-brand/10 text-brand-soft border-brand/30',
  gas: 'bg-amber/10 text-amber border-amber/30',
};

export default function ProduktePage() {
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  useEffect(() => { apiFetch('/api/produkte').then(r => r.json()).then(setProdukte).catch(() => {}); }, []);

  return (
    <div>
      <PageHeader
        kicker="Verwaltung"
        title="Produkte"
        subtitle="Tarife und Energiearten, auf die Provisionsregeln greifen."
      />
      <DataTable<Produkt>
        title="Alle Produkte"
        rows={produkte}
        columns={[
          { key: 'name', header: 'Produkt', render: r => <span className="font-semibold text-ink">{r.name}</span> },
          {
            key: 'energie', header: 'Energie',
            render: r => (
              <span className={`chip capitalize ${energieCls[r.energie?.toLowerCase()] ?? 'bg-steel/10 text-steel2 border-line'}`}>
                {r.energie}
              </span>
            ),
          },
          {
            key: 'bestand', header: 'Bestand',
            render: r => r.bestand
              ? <span className="chip bg-amber/10 text-amber border-amber/30">Ja (kein Satz)</span>
              : <span className="text-steel2">Nein</span>,
          },
        ]}
      />
    </div>
  );
}
