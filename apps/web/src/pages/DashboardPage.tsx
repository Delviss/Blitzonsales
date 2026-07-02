import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell, PieChart, Pie, Legend,
} from 'recharts';
import { apiFetch, getUser, formatEur } from '../lib/auth';
import StatusPill from '../components/StatusPill';
import StatCard from '../components/StatCard';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import { EuroIcon, FileCheckIcon, AlertIcon, UsersIcon } from '../components/icons';

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

/* Chart theme — brand cyan for single-series marks; the categorical set below is
   CVD-validated against the panel surface (dataviz palette check). */
const SERIES = '#22C0EE';
const CATEGORICAL = ['#1794C6', '#C98500', '#9085E9', '#E66767'];
const RISK = '#E66767';
const GRID = '#1B2C42';
const TICK = { fill: '#647A90', fontSize: 10.5 };
const TOOLTIP_STYLE = {
  background: '#0D1B2C',
  border: '1px solid #1B2C42',
  borderRadius: 12,
  boxShadow: '0 12px 32px -12px rgba(0,0,0,0.8)',
  fontSize: 12,
};
const CURSOR = { fill: 'rgba(255,255,255,0.04)' };

/* Labels wear text ink, not the slice color (dataviz: text wears text tokens). */
const RADIAN = Math.PI / 180;
function renderPieLabel({ cx, cy, midAngle, outerRadius, name, value }: any) {
  const r = outerRadius + 16;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#A9BDCE" fontSize={12} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${name}: ${value}`}
    </text>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card card-hover p-5 animate-fade-up">
      <h2 className="font-bold text-white mb-4 text-sm">{title}</h2>
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
      <PageHeader
        kicker="Dashboard"
        title={isRep ? 'Meine Übersicht' : 'Übersicht'}
        subtitle={
          <>
            Willkommen, <span className="text-ink font-semibold">{user?.email}</span>
            {isRep && ' – hier siehst du ausschließlich deine eigenen Daten.'}
          </>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={isRep ? 'Meine Provision (freigegeben)' : 'Nettoprovision (freigegeben)'}
          value={kpis ? formatEur(kpis.netCommission) : undefined}
          icon={<EuroIcon size={17} />}
          tone="brand"
        />
        <StatCard
          label="Gültige Verträge"
          value={kpis?.validContracts}
          icon={<FileCheckIcon size={17} />}
          tone="neutral"
        />
        <StatCard
          label="Widerruf / Storno"
          value={kpis?.widerrufStornoCount}
          icon={<AlertIcon size={17} />}
          tone={(kpis?.widerrufStornoCount ?? 0) > 0 ? 'danger' : 'neutral'}
        />
        <StatCard
          label={isRep ? 'Aktiv' : 'Aktive Verkäufer'}
          value={kpis?.activeReps}
          icon={<UsersIcon size={17} />}
          tone="neutral"
        />
      </div>

      {dashboard && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <ChartCard title="Statusverteilung">
            <BarChart data={dashboard.statusDistribution}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="status" tick={TICK} interval={0} angle={-20} textAnchor="end" height={70} axisLine={{ stroke: GRID }} tickLine={false} />
              <YAxis tick={TICK} allowDecimals={false} axisLine={false} tickLine={false} width={36} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} />
              <Bar dataKey="count" name="Verträge" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Energieverteilung">
            <PieChart>
              <Pie
                data={dashboard.energieSplit}
                dataKey="count"
                nameKey="energie"
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={3}
                stroke="#0B1522"
                strokeWidth={2}
                label={renderPieLabel}
                labelLine={{ stroke: '#647A90' }}
              >
                {dashboard.energieSplit.map((_, i) => (
                  <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                ))}
              </Pie>
              <Legend
                wrapperStyle={{ fontSize: 11.5 }}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => <span style={{ color: '#A9BDCE' }}>{value}</span>}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ChartCard>

          {!isRep && (
            <ChartCard title="Provision je Organisation">
              <BarChart data={dashboard.byOrganisation}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={54} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v: number) => formatEur(v)} />
                <Bar dataKey="commission" name="Provision" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ChartCard>
          )}

          <ChartCard title="Provision je Produkt">
            <BarChart data={dashboard.byProdukt}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" tick={{ ...TICK, fontSize: 9.5 }} interval={0} angle={-20} textAnchor="end" height={70} axisLine={{ stroke: GRID }} tickLine={false} />
              <YAxis tick={TICK} axisLine={false} tickLine={false} width={54} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v: number) => formatEur(v)} />
              <Bar dataKey="commission" name="Provision" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={30} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Stornoquote über Zeit">
            <LineChart data={dashboard.cancellationRateByPeriod}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="periode" tick={TICK} axisLine={{ stroke: GRID }} tickLine={false} />
              <YAxis tick={TICK} unit="%" axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
              <Line
                type="monotone"
                dataKey="rate"
                name="Stornoquote"
                stroke={RISK}
                strokeWidth={2}
                dot={{ r: 3, fill: '#0B1522', stroke: RISK, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartCard>

          {!isRep && (
            <ChartCard title="Auszahlung je Verkäufer">
              <BarChart data={dashboard.payoutsByRep}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={{ ...TICK, fontSize: 9.5 }} interval={0} angle={-20} textAnchor="end" height={70} axisLine={{ stroke: GRID }} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={54} />
                <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR} formatter={(v: number) => formatEur(v)} />
                <Bar dataKey="betrag" name="Auszahlung" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ChartCard>
          )}
        </div>
      )}

      {isRep && dashboard?.myLines && dashboard.myLines.length > 0 && (
        <div className="mb-8">
          <DataTable<MyLine>
            title="Meine Provisionszeilen"
            rows={dashboard.myLines}
            columns={[
              { key: 'joulesId', header: 'Vertrag', render: l => <span className="font-mono text-brand-soft">{l.joulesId ?? '—'}</span> },
              { key: 'periode', header: 'Periode', render: l => <span className="text-ink">{l.periode}</span> },
              { key: 'runStatus', header: 'Lauf-Status', render: l => (l.runStatus === 'freigegeben' ? 'Freigegeben' : 'Entwurf') },
              {
                key: 'betrag', header: 'Betrag', align: 'right',
                render: l => (
                  <span className={`font-mono font-bold ${l.betrag < 0 ? 'text-red' : 'text-brand-soft'}`}>{formatEur(l.betrag)}</span>
                ),
              },
              { key: 'begruendung', header: 'Begründung', render: l => l.begruendung ?? '—' },
            ]}
          />
        </div>
      )}

      <DataTable<Contract>
        title={isRep ? 'Meine Verträge' : 'Letzte Verträge'}
        rows={contracts.slice(0, 20)}
        columns={[
          { key: 'joulesId', header: 'Joules ID', render: c => <span className="font-mono text-brand-soft">{c.joulesId}</span> },
          { key: 'rep', header: 'Verkäufer', render: c => <span className="text-ink font-medium">{c.rep?.name ?? '—'}</span> },
          { key: 'produkt', header: 'Produkt', render: c => c.produkt?.name ?? '—' },
          { key: 'status', header: 'Status', render: c => <StatusPill status={c.status} /> },
          { key: 'kunde', header: 'Kunde', render: c => c.kunde ?? '—' },
        ]}
      />
    </div>
  );
}
