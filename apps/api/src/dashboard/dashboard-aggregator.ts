import { CLAWBACK_STATUS, VertragStatus, ZAEHLT_STATUS } from '@blitzon/shared';

export interface AggregatorContract {
  id: string;
  status: string;
  produktId: string | null;
  organisationId: string | null;
  repId: string | null;
  erfassungsdatum: string | null;
}

/** A commission line already resolved to only those belonging to freigegeben (frozen) runs. */
export interface AggregatorLine {
  contractId: string | null;
  repId: string | null;
  organisationId: string | null;
  produktId: string | null;
  periode: string;
  betrag: number;
  typ: 'normal' | 'clawback';
}

export interface AggregatorRep {
  id: string;
  name: string;
  aktiv: boolean;
}

export interface AggregatorLookups {
  organisationen: Map<string, string>;
  produkte: Map<string, { name: string; energie: string }>;
}

export interface DashboardData {
  kpis: {
    netCommission: number;
    validContracts: number;
    widerrufStornoCount: number;
    activeReps: number;
  };
  statusDistribution: { status: string; count: number }[];
  byOrganisation: { organisationId: string; name: string; contracts: number; commission: number }[];
  byProdukt: { produktId: string; name: string; energie: string; contracts: number; commission: number }[];
  energieSplit: { energie: string; count: number }[];
  cancellationRateByPeriod: { periode: string; total: number; cancelled: number; rate: number }[];
  payoutsByRep: { repId: string; name: string; betrag: number }[];
}

function monatVon(iso: string | null): string | null {
  if (!iso) return null;
  return iso.slice(0, 7); // "JJJJ-MM"
}

/**
 * Pure aggregation over already role-scoped data. `lines` must be pre-filtered to
 * commission_line rows belonging only to freigegeben (frozen) runs, since the
 * dashboard's financial KPIs must reconcile exactly to approved run totals.
 */
export function buildDashboard(
  contracts: AggregatorContract[],
  lines: AggregatorLine[],
  reps: AggregatorRep[],
  lookups: AggregatorLookups,
): DashboardData {
  const netCommission = round2(lines.reduce((sum, l) => sum + Number(l.betrag), 0));
  const validContracts = contracts.filter(c => ZAEHLT_STATUS.has(c.status as VertragStatus)).length;
  const widerrufStornoCount = contracts.filter(c => CLAWBACK_STATUS.has(c.status as VertragStatus)).length;
  const activeReps = reps.filter(r => r.aktiv).length;

  const statusCounts = new Map<string, number>();
  for (const c of contracts) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
  const statusDistribution = Array.from(statusCounts.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const orgContractCounts = new Map<string, number>();
  for (const c of contracts) {
    if (!c.organisationId) continue;
    orgContractCounts.set(c.organisationId, (orgContractCounts.get(c.organisationId) ?? 0) + 1);
  }
  const orgCommission = new Map<string, number>();
  for (const l of lines) {
    if (!l.organisationId) continue;
    orgCommission.set(l.organisationId, round2((orgCommission.get(l.organisationId) ?? 0) + Number(l.betrag)));
  }
  const orgIds = new Set([...orgContractCounts.keys(), ...orgCommission.keys()]);
  const byOrganisation = Array.from(orgIds).map(id => ({
    organisationId: id,
    name: lookups.organisationen.get(id) ?? 'Unbekannt',
    contracts: orgContractCounts.get(id) ?? 0,
    commission: orgCommission.get(id) ?? 0,
  })).sort((a, b) => b.commission - a.commission);

  const produktContractCounts = new Map<string, number>();
  for (const c of contracts) {
    if (!c.produktId) continue;
    produktContractCounts.set(c.produktId, (produktContractCounts.get(c.produktId) ?? 0) + 1);
  }
  const produktCommission = new Map<string, number>();
  for (const l of lines) {
    if (!l.produktId) continue;
    produktCommission.set(l.produktId, round2((produktCommission.get(l.produktId) ?? 0) + Number(l.betrag)));
  }
  const produktIds = new Set([...produktContractCounts.keys(), ...produktCommission.keys()]);
  const byProdukt = Array.from(produktIds).map(id => {
    const info = lookups.produkte.get(id);
    return {
      produktId: id,
      name: info?.name ?? 'Unbekannt',
      energie: info?.energie ?? 'Unbekannt',
      contracts: produktContractCounts.get(id) ?? 0,
      commission: produktCommission.get(id) ?? 0,
    };
  }).sort((a, b) => b.commission - a.commission);

  const energieCounts = new Map<string, number>();
  for (const c of contracts) {
    const energie = c.produktId ? lookups.produkte.get(c.produktId)?.energie : undefined;
    const key = energie ?? 'Unbekannt';
    energieCounts.set(key, (energieCounts.get(key) ?? 0) + 1);
  }
  const energieSplit = Array.from(energieCounts.entries()).map(([energie, count]) => ({ energie, count }));

  const periodTotals = new Map<string, { total: number; cancelled: number }>();
  for (const c of contracts) {
    const periode = monatVon(c.erfassungsdatum);
    if (!periode) continue;
    const entry = periodTotals.get(periode) ?? { total: 0, cancelled: 0 };
    entry.total += 1;
    if (CLAWBACK_STATUS.has(c.status as VertragStatus)) entry.cancelled += 1;
    periodTotals.set(periode, entry);
  }
  const cancellationRateByPeriod = Array.from(periodTotals.entries())
    .map(([periode, { total, cancelled }]) => ({
      periode,
      total,
      cancelled,
      rate: total > 0 ? round2((cancelled / total) * 100) : 0,
    }))
    .sort((a, b) => a.periode.localeCompare(b.periode));

  const repPayouts = new Map<string, number>();
  for (const l of lines) {
    if (!l.repId) continue;
    repPayouts.set(l.repId, round2((repPayouts.get(l.repId) ?? 0) + Number(l.betrag)));
  }
  const repById = new Map(reps.map(r => [r.id, r.name]));
  const payoutsByRep = Array.from(repPayouts.entries())
    .map(([repId, betrag]) => ({ repId, name: repById.get(repId) ?? 'Unbekannt', betrag }))
    .sort((a, b) => b.betrag - a.betrag);

  return {
    kpis: { netCommission, validContracts, widerrufStornoCount, activeReps },
    statusDistribution,
    byOrganisation,
    byProdukt,
    energieSplit,
    cancellationRateByPeriod,
    payoutsByRep,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
