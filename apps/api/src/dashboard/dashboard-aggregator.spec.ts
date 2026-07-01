import { buildDashboard, AggregatorContract, AggregatorLine, AggregatorRep, AggregatorLookups } from './dashboard-aggregator';
import { VertragStatus } from '@blitzon/shared';

const lookups: AggregatorLookups = {
  organisationen: new Map([['org1', 'Spear Vertrieb']]),
  produkte: new Map([
    ['p1', { name: 'swa Gas Fest6 DV', energie: 'Gas' }],
    ['p2', { name: 'swa Strom Fest24 DV', energie: 'Strom' }],
  ]),
};

const contracts: AggregatorContract[] = [
  { id: 'c1', status: VertragStatus.InBelieferung, produktId: 'p1', organisationId: 'org1', repId: 'r1', erfassungsdatum: '2026-05-15' },
  { id: 'c2', status: VertragStatus.Widerruf, produktId: 'p2', organisationId: 'org1', repId: 'r2', erfassungsdatum: '2026-05-20' },
  { id: 'c3', status: VertragStatus.Abgelehnt, produktId: 'p2', organisationId: 'org1', repId: 'r1', erfassungsdatum: '2026-06-01' },
];

const lines: AggregatorLine[] = [
  { contractId: 'c1', repId: 'r1', organisationId: 'org1', produktId: 'p1', periode: '2026-05', betrag: 50, typ: 'normal' },
  { contractId: 'c2', repId: 'r2', organisationId: 'org1', produktId: 'p2', periode: '2026-05', betrag: -30, typ: 'clawback' },
];

const reps: AggregatorRep[] = [
  { id: 'r1', name: 'Anna Fuchs', aktiv: true },
  { id: 'r2', name: 'Kevin Lorenz', aktiv: true },
  { id: 'r3', name: 'Inaktiv Rep', aktiv: false },
];

describe('buildDashboard', () => {
  it('reconciles netCommission and payoutsByRep exactly to the sum of frozen-run lines', () => {
    const rawSum = lines.reduce((sum, l) => sum + l.betrag, 0);
    const result = buildDashboard(contracts, lines, reps, lookups);
    expect(result.kpis.netCommission).toBe(rawSum);
    const payoutSum = result.payoutsByRep.reduce((sum, r) => sum + r.betrag, 0);
    expect(payoutSum).toBe(rawSum);
  });

  it('counts valid and cancelled contracts correctly', () => {
    const result = buildDashboard(contracts, lines, reps, lookups);
    expect(result.kpis.validContracts).toBe(1); // only InBelieferung counts (Widerruf/Abgelehnt excluded)
    expect(result.kpis.widerrufStornoCount).toBe(1);
  });

  it('counts only active reps toward activeReps KPI', () => {
    const result = buildDashboard(contracts, lines, reps, lookups);
    expect(result.kpis.activeReps).toBe(2);
  });

  it('breaks down commission by organisation and product', () => {
    const result = buildDashboard(contracts, lines, reps, lookups);
    expect(result.byOrganisation).toEqual([{ organisationId: 'org1', name: 'Spear Vertrieb', contracts: 3, commission: 20 }]);
    const gas = result.byProdukt.find(p => p.produktId === 'p1');
    expect(gas).toMatchObject({ contracts: 1, commission: 50 });
  });

  it('splits contracts by energy source', () => {
    const result = buildDashboard(contracts, lines, reps, lookups);
    expect(result.energieSplit).toEqual(expect.arrayContaining([
      { energie: 'Gas', count: 1 },
      { energie: 'Strom', count: 2 },
    ]));
  });

  it('computes a monthly cancellation rate from erfassungsdatum', () => {
    const result = buildDashboard(contracts, lines, reps, lookups);
    const may = result.cancellationRateByPeriod.find(p => p.periode === '2026-05');
    expect(may).toEqual({ periode: '2026-05', total: 2, cancelled: 1, rate: 50 });
  });

  it('rounds monetary aggregates to two decimal places despite floating point drift', () => {
    const drifty: AggregatorLine[] = [
      { contractId: 'c1', repId: 'r1', organisationId: 'org1', produktId: 'p1', periode: '2026-05', betrag: 0.1, typ: 'normal' },
      { contractId: 'c2', repId: 'r1', organisationId: 'org1', produktId: 'p1', periode: '2026-05', betrag: 0.2, typ: 'normal' },
    ];
    const result = buildDashboard(contracts, drifty, reps, lookups);
    expect(result.kpis.netCommission).toBe(0.3);
  });
});
