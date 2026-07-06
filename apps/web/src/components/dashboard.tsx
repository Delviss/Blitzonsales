import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  FileCheck2,
  FilePlus2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatEur, getUser } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusPill from '@/components/StatusPill';

/* ------------------------------- data types ------------------------------ */

interface Contract {
  id: string;
  joulesId: string;
  status: string;
  kunde: string | null;
  erfassungsdatum?: string | null;
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

interface Run {
  id: string;
  periode: string;
  status: string;
  freigegebenAm: string | null;
  organisation?: { name: string } | null;
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

/* ------------------------------ chart theming ---------------------------- */

/* Colours are driven by the per-theme chart ramp declared in index.css. The
   categorical set is the dataviz six-checks-validated palette (own steps for the
   light-white and dark card surfaces); the hero charts use the BlitzON brand
   cyan. Everything reads from CSS variables so it re-themes with the toggle. */
const TICK = { fill: 'hsl(var(--chart-axis))', fontSize: 11 };
const GRID = 'var(--chart-grid)';
const PRIMARY = 'var(--chart-primary)';
const CATEGORICAL = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];
const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 12,
  color: 'hsl(var(--popover-foreground))',
  boxShadow: '0 16px 40px -16px rgba(0,0,0,0.55)',
  fontSize: 12,
  padding: '8px 12px',
};
const TOOLTIP_LABEL: React.CSSProperties = { color: 'hsl(var(--muted-foreground))', marginBottom: 2 };
const CURSOR = { fill: 'var(--chart-primary)', fillOpacity: 0.08 };

function formatPeriode(periode: string): string {
  const [y, m] = periode.split('-').map(Number);
  if (!y || !m) return periode;
  return new Date(y, m - 1, 1).toLocaleDateString('de-DE', { month: 'short', year: '2-digit' });
}

function relativeDe(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'gestern';
  if (days < 30) return `vor ${days} Tagen`;
  return new Date(iso).toLocaleDateString('de-DE');
}

/* --------------------------------- pieces -------------------------------- */

function TrendRow({
  delta,
  suffix = '%',
  goodWhenDown = false,
  label = 'vs. Vormonat',
}: {
  delta: number | null;
  suffix?: string;
  goodWhenDown?: boolean;
  label?: string;
}) {
  if (delta === null) return <div className="mt-2 text-xs text-muted-foreground">{label}</div>;
  const up = delta >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="mt-2 flex items-center gap-1 text-xs">
      <Icon className={cn('size-3.5', good ? 'text-green' : 'text-red')} />
      <span className={cn('font-semibold', good ? 'text-green' : 'text-red')}>
        {Math.abs(delta).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
        {suffix}
      </span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

const KPI_ACCENTS = {
  brand: 'text-brand bg-brand/10 ring-brand/20',
  green: 'text-green bg-green/10 ring-green/20',
  amber: 'text-amber bg-amber/10 ring-amber/20',
  violet: 'text-chart-2 bg-chart-2/10 ring-chart-2/20',
} as const;

function KpiCell({
  label,
  value,
  trend,
  icon: Icon,
  accent = 'brand',
}: {
  label: string;
  value: React.ReactNode;
  trend: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: keyof typeof KPI_ACCENTS;
}) {
  return (
    <div className="group relative p-5">
      {/* left brand seam, revealed on hover */}
      <span className="pointer-events-none absolute inset-y-4 left-0 w-0.5 rounded-full bg-brand/0 transition-colors duration-300 group-hover:bg-brand/60" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">{label}</div>
          {value === undefined || value === null ? (
            <div className="skeleton mt-2 h-8 w-24" />
          ) : (
            <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {value}
            </div>
          )}
          {trend}
        </div>
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-110',
            KPI_ACCENTS[accent],
          )}
        >
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function ChartBadge({ value, goodWhenDown = false }: { value: number | null; goodWhenDown?: boolean }) {
  if (value === null) return null;
  const up = value >= 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Badge variant={good ? 'success' : 'destructive'} className="rounded-full px-2">
      <Icon className="size-3" />
      {Math.abs(value).toLocaleString('de-DE', { maximumFractionDigits: 1 })}%
    </Badge>
  );
}

function ChartCard({
  title,
  description,
  badge,
  height = 260,
  className,
  children,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  height?: number;
  className?: string;
  children: React.ReactElement;
}) {
  return (
    <Card
      className={cn(
        'animate-fade-up transition-all duration-300 hover:border-brand/30 hover:shadow-glow',
        className,
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-[15px]">{title}</CardTitle>
          {badge}
        </div>
        {description && <CardDescription className="text-[12.5px]">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height }}>
          <ResponsiveContainer>{children}</ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

interface ActivityItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  time: string;
}

/* -------------------------------- dashboard ------------------------------ */

export function Dashboard() {
  const user = getUser();
  const isRep = user?.rolle === 'aussendienst';
  const canSeeRuns = !!user && ['admin_gf', 'teamleiter', 'backoffice'].includes(user.rolle);

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);

  useEffect(() => {
    apiFetch('/api/vertraege').then(r => r.json()).then(setContracts).catch(() => {});
    apiFetch('/api/dashboard').then(r => r.json()).then(setDashboard).catch(() => {});
    if (canSeeRuns) {
      apiFetch('/api/provisionslaeufe').then(r => r.json()).then(setRuns).catch(() => {});
    }
  }, [canSeeRuns]);

  const kpis = dashboard?.kpis;
  const periods = dashboard?.cancellationRateByPeriod ?? [];
  /* The running calendar month is only partially filled — comparing it against a
     full month would produce misleading deltas, so trends use closed months only. */
  const nowPeriode = new Date().toISOString().slice(0, 7);
  const closed = periods.length && periods[periods.length - 1].periode === nowPeriode
    ? periods.slice(0, -1)
    : periods;
  const current = closed[closed.length - 1];
  const previous = closed[closed.length - 2];

  const contractsDelta =
    current && previous && previous.total > 0
      ? ((current.total - previous.total) / previous.total) * 100
      : null;
  const stornoDeltaPp = current && previous ? current.rate - previous.rate : null;

  const barData = useMemo(
    () => periods.map(p => ({ ...p, label: formatPeriode(p.periode) })),
    [periods],
  );

  const recentContracts = useMemo(
    () =>
      [...contracts]
        .sort((a, b) => (b.erfassungsdatum ?? '').localeCompare(a.erfassungsdatum ?? ''))
        .slice(0, 6),
    [contracts],
  );

  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    if (isRep) {
      for (const line of (dashboard?.myLines ?? []).slice(0, 2)) {
        items.push({
          icon: Wallet,
          title: `Provision ${formatEur(line.betrag)} für ${line.joulesId ?? 'Vertrag'} (${line.periode})`,
          time: line.runStatus === 'freigegeben' ? 'freigegeben' : 'Entwurf',
        });
      }
    } else {
      const sortedRuns = [...runs].sort((a, b) =>
        (b.freigegebenAm ?? b.periode).localeCompare(a.freigegebenAm ?? a.periode),
      );
      for (const run of sortedRuns.slice(0, 2)) {
        items.push({
          icon: Wallet,
          title:
            run.status === 'freigegeben'
              ? `Provisionslauf ${run.periode} freigegeben`
              : `Provisionslauf ${run.periode} in Entwurf`,
          time: run.freigegebenAm ? relativeDe(run.freigegebenAm) : `Periode ${run.periode}`,
        });
      }
    }
    for (const c of recentContracts.slice(0, 3 - Math.min(items.length, 2))) {
      items.push({
        icon: FilePlus2,
        title: `Vertrag ${c.joulesId} erfasst`,
        time: c.erfassungsdatum ? new Date(c.erfassungsdatum).toLocaleDateString('de-DE') : '',
      });
    }
    return items.slice(0, 3);
  }, [isRep, dashboard?.myLines, runs, recentContracts]);

  const stornoCount = kpis?.widerrufStornoCount ?? 0;
  const healthy = stornoCount === 0;

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
      {/* Shared gradients — url(#…) resolves document-wide, so they live in one
          hidden SVG outside the individual chart SVGs. */}
      <svg width="0" height="0" className="absolute" aria-hidden focusable="false">
        <defs>
          {/* Hero brand bar: bright cyan top fading toward the baseline. */}
          <linearGradient id="barCyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-primary-soft)" stopOpacity={0.98} />
            <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0.35} />
          </linearGradient>
          {/* Area fill under the contracts line. */}
          <linearGradient id="areaCyan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-primary)" stopOpacity={0.32} />
            <stop offset="100%" stopColor="var(--chart-primary)" stopOpacity={0} />
          </linearGradient>
          {/* Area fill under the storno line (red). */}
          <linearGradient id="areaStorno" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.26} />
            <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      {/* KPI row — one card, four cells with hairline dividers */}
      <Card className="animate-fade-up">
        <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 [&>*:nth-child(2n)]:sm:border-l xl:[&>*+*]:border-l [&>*]:border-border">
          <KpiCell
            label="Aktive Verkäufer"
            value={kpis?.activeReps}
            icon={Users}
            accent="brand"
            trend={<TrendRow delta={null} label={isRep ? 'dein Zugang' : 'im Zugriffsbereich'} />}
          />
          <KpiCell
            label={isRep ? 'Meine Provision' : 'Nettoprovision'}
            value={kpis ? formatEur(kpis.netCommission) : undefined}
            icon={Wallet}
            accent="green"
            trend={<TrendRow delta={null} label="aus freigegebenen Läufen" />}
          />
          <KpiCell
            label="Stornoquote"
            value={current ? `${current.rate.toLocaleString('de-DE')}%` : kpis ? '0%' : undefined}
            icon={AlertTriangle}
            accent="amber"
            trend={<TrendRow delta={stornoDeltaPp} suffix=" Pp." goodWhenDown />}
          />
          <KpiCell
            label="Gültige Verträge"
            value={kpis?.validContracts}
            icon={FileCheck2}
            accent="violet"
            trend={<TrendRow delta={contractsDelta} />}
          />
        </div>
      </Card>

      {/* Hero charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="Vertragseingang"
          description="Neue Verträge je Monat."
          badge={<ChartBadge value={contractsDelta} />}
          height={280}
        >
          <BarChart data={barData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} dy={8} />
            <YAxis hide />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} cursor={CURSOR} />
            <Bar
              dataKey="total"
              name="Verträge"
              fill="url(#barCyan)"
              stroke={PRIMARY}
              strokeOpacity={0.5}
              radius={[6, 6, 0, 0]}
              maxBarSize={56}
              activeBar={{ fill: PRIMARY, stroke: PRIMARY }}
            />
          </BarChart>
        </ChartCard>

        <ChartCard
          title="Storno-Trend"
          description="Verträge und Stornos je Monat."
          badge={<ChartBadge value={stornoDeltaPp} goodWhenDown />}
          height={280}
        >
          <ComposedChart data={barData} margin={{ top: 12, right: 12, left: 12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
            <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} dy={8} />
            <YAxis hide />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} cursor={{ stroke: GRID, strokeWidth: 1 }} />
            <Legend
              wrapperStyle={{ fontSize: 11.5, paddingTop: 4 }}
              iconType="plainline"
              iconSize={14}
              formatter={(value: string) => <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>}
            />
            <Area
              type="monotone"
              dataKey="total"
              name="Verträge"
              stroke={PRIMARY}
              strokeWidth={2.5}
              fill="url(#areaCyan)"
              dot={false}
              activeDot={{ r: 4, fill: PRIMARY, stroke: 'hsl(var(--card))', strokeWidth: 2 }}
              style={{ filter: 'drop-shadow(0 2px 8px var(--chart-primary))' }}
            />
            <Area
              type="monotone"
              dataKey="cancelled"
              name="Stornos"
              stroke="var(--chart-5)"
              strokeWidth={2.5}
              fill="url(#areaStorno)"
              dot={false}
              activeDot={{ r: 4, fill: 'var(--chart-5)', stroke: 'hsl(var(--card))', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ChartCard>
      </div>

      {/* Contracts table / health / activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card className="animate-fade-up xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px]">{isRep ? 'Meine Verträge' : 'Letzte Verträge'}</CardTitle>
            <CardDescription className="text-[12.5px]">Aktuelle Verträge und ihr Status.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-0">Kunde</TableHead>
                  <TableHead>Vertrag</TableHead>
                  <TableHead className="px-0 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentContracts.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="px-0 py-3 font-medium text-foreground">
                      {c.kunde ?? c.rep?.name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 font-mono text-xs text-muted-foreground">#{c.joulesId}</TableCell>
                    <TableCell className="px-0 py-3 text-right">
                      <StatusPill status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
                {recentContracts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="px-0 py-6 text-center text-muted-foreground">
                      Noch keine Verträge vorhanden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px]">Storno-Check</CardTitle>
            <CardDescription className="text-[12.5px]">
              {healthy ? 'Nichts braucht gerade deine Aufmerksamkeit.' : 'Rückforderungen im Blick behalten.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex h-[calc(100%-76px)] min-h-[180px] flex-col items-center justify-center text-center">
            <div
              className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full border',
                healthy ? 'border-border bg-muted text-foreground' : 'border-amber/30 bg-amber/10 text-amber',
              )}
            >
              {healthy ? <CheckCircle2 className="size-6" /> : <AlertTriangle className="size-6" />}
            </div>
            <div className="mt-4 text-[15px] font-semibold text-foreground">
              {healthy ? 'Alles im grünen Bereich.' : `${stornoCount} Widerruf/Storno`}
            </div>
            <div className="mt-1 max-w-[220px] text-xs leading-relaxed text-muted-foreground">
              {healthy
                ? 'Keine Widerrufe oder Stornos in diesem Ausschnitt.'
                : 'Diese Verträge lösen Clawbacks im nächsten Provisionslauf aus.'}
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px]">Aktivität</CardTitle>
            <CardDescription className="text-[12.5px]">Neueste Ereignisse in deinem Bereich.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border">
            {activity.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-foreground">{item.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{item.time}</div>
                  </div>
                </div>
              );
            })}
            {activity.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">Noch keine Aktivität.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* BlitzON control analytics — full feature set in the redesigned style */}
      {dashboard && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <ChartCard title="Statusverteilung" description="Verträge nach Vertragsstatus." height={240}>
            <BarChart data={dashboard.statusDistribution} margin={{ top: 8, right: 8, left: 24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
              <XAxis
                dataKey="status"
                tick={{ ...TICK, fontSize: 9.5 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={56}
                tickMargin={4}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} cursor={CURSOR} />
              <Bar dataKey="count" name="Verträge" fill="url(#barCyan)" stroke={PRIMARY} strokeOpacity={0.4} radius={[5, 5, 0, 0]} activeBar={{ fill: PRIMARY }} maxBarSize={28} />
            </BarChart>
          </ChartCard>

          <ChartCard title="Energieverteilung" description="Verträge nach Energieart." height={240}>
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
                stroke="hsl(var(--card))"
                strokeWidth={2}
              >
                {dashboard.energieSplit.map((_, i) => (
                  <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
                ))}
              </Pie>
              <Legend
                wrapperStyle={{ fontSize: 11.5 }}
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span style={{ color: 'hsl(var(--muted-foreground))' }}>{value}</span>
                )}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} />
            </PieChart>
          </ChartCard>

          {!isRep && (
            <ChartCard title="Provision je Organisation" description="Freigegebene Provision nach Organisation." height={240}>
              <BarChart data={dashboard.byOrganisation} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
                <XAxis dataKey="name" tick={TICK} axisLine={false} tickLine={false} dy={6} />
                <YAxis hide />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL}
                  cursor={CURSOR}
                  formatter={(v: number) => formatEur(v)}
                />
                <Bar dataKey="commission" name="Provision" fill="url(#barCyan)" stroke={PRIMARY} strokeOpacity={0.4} radius={[5, 5, 0, 0]} activeBar={{ fill: PRIMARY }} maxBarSize={36} />
              </BarChart>
            </ChartCard>
          )}

          <ChartCard title="Provision je Produkt" description="Freigegebene Provision nach Produkt." height={240}>
            <BarChart data={dashboard.byProdukt} margin={{ top: 8, right: 8, left: 24, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
              <XAxis
                dataKey="name"
                tick={{ ...TICK, fontSize: 9.5 }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={56}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL}
                cursor={CURSOR}
                formatter={(v: number) => formatEur(v)}
              />
              <Bar dataKey="commission" name="Provision" fill="url(#barCyan)" stroke={PRIMARY} strokeOpacity={0.4} radius={[5, 5, 0, 0]} activeBar={{ fill: PRIMARY }} maxBarSize={28} />
            </BarChart>
          </ChartCard>

          {!isRep && (
            <ChartCard title="Auszahlung je Verkäufer" description="Freigegebene Auszahlungen nach Verkäufer." height={240}>
              <BarChart data={dashboard.payoutsByRep} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 4" />
                <XAxis
                  dataKey="name"
                  tick={{ ...TICK, fontSize: 9.5 }}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={56}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL}
                  cursor={CURSOR}
                  formatter={(v: number) => formatEur(v)}
                />
                <Bar dataKey="betrag" name="Auszahlung" fill="url(#barCyan)" stroke={PRIMARY} strokeOpacity={0.4} radius={[5, 5, 0, 0]} activeBar={{ fill: PRIMARY }} maxBarSize={28} />
              </BarChart>
            </ChartCard>
          )}
        </div>
      )}

      {/* Rep-only commission lines, in the redesigned table style */}
      {isRep && dashboard?.myLines && dashboard.myLines.length > 0 && (
        <Card className="animate-fade-up">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px]">Meine Provisionszeilen</CardTitle>
            <CardDescription className="text-[12.5px]">Beträge aus Entwürfen und freigegebenen Läufen.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-0">Vertrag</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Lauf-Status</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead className="px-0">Begründung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboard.myLines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-0 py-3 font-mono text-xs text-muted-foreground">
                      {l.joulesId ? `#${l.joulesId}` : '—'}
                    </TableCell>
                    <TableCell className="py-3">{l.periode}</TableCell>
                    <TableCell className="py-3">
                      <Badge variant={l.runStatus === 'freigegeben' ? 'success' : 'secondary'} className="rounded-full">
                        {l.runStatus === 'freigegeben' ? 'Freigegeben' : 'Entwurf'}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        'py-3 text-right font-mono text-[13px] font-semibold tabular-nums',
                        l.betrag < 0 ? 'text-red' : 'text-foreground',
                      )}
                    >
                      {formatEur(l.betrag)}
                    </TableCell>
                    <TableCell className="px-0 py-3 text-xs text-muted-foreground">{l.begruendung ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Dashboard;
