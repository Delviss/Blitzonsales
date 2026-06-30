import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import DataTable from '../../components/DataTable';

interface Produkt { id: string; name: string; energie: string; bestand: boolean; }

export default function ProduktePage() {
  const [produkte, setProdukte] = useState<Produkt[]>([]);
  useEffect(() => { apiFetch('/api/produkte').then(r => r.json()).then(setProdukte).catch(() => {}); }, []);

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Verwaltung</div>
      <h1 className="text-2xl font-extrabold mb-6">Produkte</h1>
      <DataTable<Produkt>
        rows={produkte}
        columns={[
          { key: 'name', header: 'Produkt', render: r => <span className="font-semibold text-white">{r.name}</span> },
          { key: 'energie', header: 'Energie' },
          { key: 'bestand', header: 'Bestand', render: r => <span className={r.bestand ? 'text-amber font-bold' : 'text-steel2'}>{r.bestand ? 'Ja (kein Satz)' : 'Nein'}</span> },
        ]}
      />
    </div>
  );
}
