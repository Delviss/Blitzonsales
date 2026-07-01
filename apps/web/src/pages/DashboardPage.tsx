import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { apiFetch, getUser, formatEur } from '../lib/auth';
import StatusPill from '../components/StatusPill';

interface Contract {
  id: string;
  joulesId: string;
  status: string;
  kunde: string | null;
  rep?: { name: string };
  produkt?: { name: string };
}

interface MyLine {
  contractId: string | null;
  joulesId: string | null;
  periode: string;
  runStatus: string;
  betrag: number;
  typ: string;
  begruendung: string | null;
  datencheck: boolean;
}

interface DashboardData {
  kpis: { netCommission: number; validContracts: number; widerrufStornoCount: number; activeReps: number };
  statusDistribution: { status: string; count: number }[];
  byOrganisation: { organisationId: string; name: string; contracts: number; commission: number }[];
  byProdukt: { produktId: string; name: string; energie: string; contracts: number; commission: number }[];
  energieSplit: { energie: string; count: number }[];
  cancellationRateByPeriod: { periode: string; total: number; cancelled: number; rate: number }[];
  payoutsByRep: { repId: string; name: string; betrag: number }[];
  myLines?: MyLine[];
}

const CHART_COLORS = ['#8BC53F', '#A8DC57', '#E0A93B', '#D34A3A', '#7E8B9B', '#3F9D52'];

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-panel border border-line rounded-xl p-4">
      <h2 className="font-bold text-white mb-3 text-sm">{title}</h2>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>{children as any}</ResponsiveContainer>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const user = getUser();
  const isRep = user?.rolle === 'aussendienst';
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  useEffect(() => {
    apiFetch('/api/vertraege').then(r => r.json()).then(setContracts).catch(() => {});
    apiFetch('/api/dashboard').then(r => r.json()).then(setDashboard).catch(() => {});
  }, []);

  const kpis = dashboard?.kpis;

  return (
    <div>
      <div className="text-[12px] tracking-[2.5px] text-lime font-bold uppercase mb-1">Dashboard</div>
      <h1 className="text-3xl font-extrabold mb-1">{isRep ? 'Meine Übersicht' : 'Übersicht'}</h1>
      <p className="text-steel2 mb-8">
        Willkommen, {user?.email}
        {isRep && ' (hier siehst du nur deine eigenen Daten)'}
      </p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: isRep ? 'Meine Provision (freigegeben)' : 'Nettoprovision (freigegeben)', val: kpis ? formatEur(kpis.netCommission) : '—' },
          { label: 'Verträge gültig', val: kpis?.validContracts ?? '—' },
          { label: 'Widerruf / Storno', val: kpis?.widerrufStornoCount ?? '—', warn: (kpis?.widerrufStornoCount ?? 0) > 0 },
          { label: isRep ? 'Aktiv' : 'Aktive Verkäufer', val: kpis?.activeReps ?? '—' },
        ].map(kpi => (
          <div key={kpi.label} className="bg-panel border border-line rounded-xl p-4">
            <div className="text-[11px] text-steel uppercase tracking-wide">{kpi.label}</div>
            <div className={`text-2xl font-extrabold mt-1 ${kpi.warn ? 'text-red' : 'text-lime2'}`}>{kpi.val}</div>
          </div>
        ))}
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 gap-4 mb-8">
          <ChartCard title="Statusverteilung">
            <BarChart data={dashboard.statusDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2C42" />
              <XAxis dataKey="status" tick={{ fill: '#A7B3C0', fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fill: '#A7B3C0', fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0E1B2E', border: '1px solid #1C2C42' }} />
              <Bar dataKey="count" fill="#8BC53F" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Energieverteilung">
            <PieChart>
              <Pie data={dashboard.energieSplit} dataKey="count" nameKey="energie" cx="50%" cy="50%" outerRadius={80} label>
                {dashboard.energieSplit.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 11, color: '#A7B3C0' }} />
              <Tooltip contentStyle={{ background: '#0E1B2E', border: '1px solid #1C2C42' }} />
            </PieChart>
          </ChartCard>

          {!isRep && (
            <ChartCard title="Provision je Organisation">
              <BarChart data={dashboard.byOrganisation}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2C42" />
                <XAxis dataKey="name" tick={{ fill: '#A7B3C0', fontSize: 10 }} />
                <YAxis tick={{ fill: '#A7B3C0', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0E1B2E', border: '1px solid #1C2C42' }} formatter={(v: number) => formatEur(v)} />
                <Bar dataKey="commission" fill="#A8DC57" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}

          <ChartCard title="Provision je Produkt">
            <BarChart data={dashboard.byProdukt}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2C42" />
              <XAxis dataKey="name" tick={{ fill: '#A7B3C0', fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={70} />
              <YAxis tick={{ fill: '#A7B3C0', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0E1B2E', border: '1px solid #1C2C42' }} formatter={(v: number) => formatEur(v)} />
              <Bar dataKey="commission" fill="#E0A93B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Stornoquote über Zeit">
            <LineChart data={dashboard.cancellationRateByPeriod}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1C2C42" />
              <XAxis dataKey="periode" tick={{ fill: '#A7B3C0', fontSize: 10 }} />
              <YAxis tick={{ fill: '#A7B3C0', fontSize: 11 }} unit="%" />
              <Tooltip contentStyle={{ background: '#0E1B2E', border: '1px solid #1C2C42' }} formatter={(v: number) => `${v}%`} />
              <Line type="monotone" dataKey="rate" stroke="#D34A3A" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ChartCard>

          {!isRep && (
            <ChartCard title="Auszahlung je Verkäufer">
              <BarChart data={dashboard.payoutsByRep}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C2C42" />
                <XAxis dataKey="name" tick={{ fill: '#A7B3C0', fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={70} />
                <YAxis tick={{ fill: '#A7B3C0', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0E1B2E', border: '1px solid #1C2C42' }} formatter={(v: number) => formatEur(v)} />
                <Bar dataKey="betrag" fill="#8BC53F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>
          )}
        </div>
      )}

      {isRep && dashboard?.myLines && dashboard.myLines.length > 0 && (
        <div className="mb-8 bg-panel border border-line rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <h2 className="font-bold text-white">Meine Provisionszeilen</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px] border-collapse">
              <thead>
                <tr>
                  {['Vertrag', 'Periode', 'Lauf-Status', 'Betrag', 'Begründung'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 bg-navy2 text-steel2 font-semibold text-[11px] uppercase tracking-wide border-b border-line">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dashboard.myLines.map((l, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-panel' : 'bg-navy2/40'}>
                    <td className="px-4 py-2.5 font-mono text-lime2 border-b border-line/30">{l.joulesId ?? '—'}</td>
                    <td className="px-4 py-2.5 border-b border-line/30 text-white">{l.periode}</td>
                    <td className="px-4 py-2.5 border-b border-line/30 text-steel2">{l.runStatus === 'freigegeben' ? 'Freigegeben' : 'Entwurf'}</td>
                    <td className={`px-4 py-2.5 border-b border-line/30 font-mono font-bold ${l.betrag < 0 ? 'text-red' : 'text-lime2'}`}>{formatEur(l.betrag)}</td>
                    <td className="px-4 py-2.5 border-b border-line/30 text-steel2">{l.begruendung ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-panel border border-line rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <h2 className="font-bold text-white">{isRep ? 'Meine Verträge' : 'Letzte Verträge'}</h2>
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
