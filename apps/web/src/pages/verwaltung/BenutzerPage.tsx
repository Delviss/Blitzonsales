import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import DataTable from '../../components/DataTable';

interface Benutzer { id: string; email: string; rolle: string; twofaEnabled: boolean; }

const rollenLabels: Record<string, string> = {
  admin_gf: 'Admin / GF',
  teamleiter: 'Teamleiter',
  backoffice: 'Backoffice',
  aussendienst: 'Außendienst',
};

export default function BenutzerPage() {
  const [benutzer, setBenutzer] = useState<Benutzer[]>([]);
  useEffect(() => { apiFetch('/api/benutzer').then(r => r.json()).then(setBenutzer).catch(() => {}); }, []);

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Verwaltung</div>
      <h1 className="text-2xl font-extrabold mb-6">Benutzer</h1>
      <DataTable<Benutzer>
        rows={benutzer}
        columns={[
          { key: 'email', header: 'E-Mail', render: r => <span className="text-white font-semibold">{r.email}</span> },
          { key: 'rolle', header: 'Rolle', render: r => rollenLabels[r.rolle] ?? r.rolle },
          { key: 'twofaEnabled', header: '2FA', render: r => <span className={r.twofaEnabled ? 'text-green font-bold' : 'text-steel'}>{r.twofaEnabled ? 'Aktiv' : '—'}</span> },
        ]}
      />
    </div>
  );
}
