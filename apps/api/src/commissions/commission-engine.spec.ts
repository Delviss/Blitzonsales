import { VertragStatus } from '@blitzon/shared';
import { evaluateClawback, evaluateNewContract, findApplicableRule, EngineContract, EngineRule } from './commission-engine';

function contract(overrides: Partial<EngineContract> = {}): EngineContract {
  return {
    id: 'c1',
    produktId: 'p1',
    organisationId: 'o1',
    lieferbeginn: '2026-07-15',
    erfassungsdatum: '2026-07-01',
    status: VertragStatus.InBelieferung,
    ...overrides,
  };
}

function rule(overrides: Partial<EngineRule> = {}): EngineRule {
  return {
    id: 'r1',
    typ: 'Satz Strom Neukunde',
    produktId: 'p1',
    organisationId: 'o1',
    gueltigAb: '2026-01-01',
    gueltigBis: null,
    satz: 50,
    ...overrides,
  };
}

describe('findApplicableRule', () => {
  it('returns null when there is no reference date', () => {
    expect(findApplicableRule(contract({ lieferbeginn: null, erfassungsdatum: null }), [rule()])).toBeNull();
  });

  it('matches a rule scoped to the same product and organisation', () => {
    const r = rule();
    expect(findApplicableRule(contract(), [r])).toEqual(r);
  });

  it('ignores rules for a different product', () => {
    const r = rule({ produktId: 'other' });
    expect(findApplicableRule(contract(), [r])).toBeNull();
  });

  it('ignores rules that are not yet valid', () => {
    const r = rule({ gueltigAb: '2099-01-01' });
    expect(findApplicableRule(contract(), [r])).toBeNull();
  });

  it('ignores rules that expired before the reference date', () => {
    const r = rule({ gueltigBis: '2026-01-01' });
    expect(findApplicableRule(contract(), [r])).toBeNull();
  });

  it('prefers the more specific (product+org) rule over a wildcard rule', () => {
    const wildcard = rule({ id: 'wildcard', produktId: null, organisationId: null });
    const specific = rule({ id: 'specific' });
    expect(findApplicableRule(contract(), [wildcard, specific])?.id).toBe('specific');
  });

  it('picks the most recently valid rule among ties', () => {
    const older = rule({ id: 'older', gueltigAb: '2026-01-01' });
    const newer = rule({ id: 'newer', gueltigAb: '2026-06-01' });
    expect(findApplicableRule(contract(), [older, newer])?.id).toBe('newer');
  });
});

describe('evaluateNewContract', () => {
  it('grants no commission for KEIN_SATZ statuses', () => {
    const result = evaluateNewContract(contract({ status: VertragStatus.Abgelehnt }), [rule()]);
    expect(result.betrag).toBe(0);
    expect(result.datencheck).toBe(false);
    expect(result.begruendung).toContain('Kein Anspruch');
  });

  it('grants no commission for a contract that starts already cancelled', () => {
    const result = evaluateNewContract(contract({ status: VertragStatus.Widerruf }), [rule()]);
    expect(result.betrag).toBe(0);
    expect(result.typ).toBe('normal');
  });

  it('flags missing produkt as Datencheck', () => {
    const result = evaluateNewContract(contract({ produktId: null }), [rule()]);
    expect(result.datencheck).toBe(true);
    expect(result.betrag).toBe(0);
  });

  it('flags missing lieferbeginn as Datencheck', () => {
    const result = evaluateNewContract(contract({ lieferbeginn: null }), [rule()]);
    expect(result.datencheck).toBe(true);
  });

  it('flags Datencheck status even when data is complete', () => {
    const result = evaluateNewContract(contract({ status: VertragStatus.Datencheck }), [rule()]);
    expect(result.datencheck).toBe(true);
  });

  it('applies the matching rule satz for a valid contract', () => {
    const result = evaluateNewContract(contract(), [rule()]);
    expect(result.betrag).toBe(50);
    expect(result.regelId).toBe('r1');
    expect(result.datencheck).toBe(false);
  });

  it('explains when no rule matches', () => {
    const result = evaluateNewContract(contract(), []);
    expect(result.betrag).toBe(0);
    expect(result.begruendung).toContain('Keine passende Provisionsregel');
  });
});

describe('evaluateClawback', () => {
  it('reverses the original amount and keeps the original rule reference', () => {
    const result = evaluateClawback({ betrag: 50, regelId: 'r1' }, contract({ status: VertragStatus.Storno }));
    expect(result.betrag).toBe(-50);
    expect(result.typ).toBe('clawback');
    expect(result.regelId).toBe('r1');
    expect(result.begruendung).toContain('Storno');
  });
});
