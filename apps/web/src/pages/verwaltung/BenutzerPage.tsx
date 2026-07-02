import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import DataTable from '../../components/DataTable';
import PageHeader from '../../components/PageHeader';
import { ShieldIcon } from '../../components/icons';

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
      <PageHeader
        kicker="Verwaltung"
        title="Benutzer"
        subtitle="Zugänge, Rollen und Zwei-Faktor-Status der Plattform."
      />
      <DataTable<Benutzer>
        title="Alle Benutzer"
        rows={benutzer}
        columns={[
          {
            key: 'email', header: 'E-Mail',
            render: r => (
              <span className="flex items-center gap-2.5">
                <span className="h-7 w-7 rounded-full bg-gradient-to-br from-brand-soft to-brand-deep flex items-center justify-center text-night text-[11px] font-black uppercase">
                  {r.email[0]}
                </span>
                <span className="text-ink font-semibold">{r.email}</span>
              </span>
            ),
          },
          { key: 'rolle', header: 'Rolle', render: r => rollenLabels[r.rolle] ?? r.rolle },
          {
            key: 'twofaEnabled', header: '2FA',
            render: r => r.twofaEnabled
              ? <span className="chip bg-green/10 text-green border-green/30"><ShieldIcon size={11} />Aktiv</span>
              : <span className="text-steel">—</span>,
          },
        ]}
      />
    </div>
  );
}
