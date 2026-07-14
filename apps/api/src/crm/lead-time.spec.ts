import { ConfigKey, FACHKONZEPT_DEFAULTS } from '@blitzon/shared';
import {
  addDays,
  daysBetween,
  evaluateLeadTime,
  LEAD_TIME_REJECTION_REASON,
  resolveDeliveryStart,
} from './lead-time';

const LEAD_TIME_DAYS = FACHKONZEPT_DEFAULTS[ConfigKey.LeadTimeDays] as number; // 365

// ---------------------------------------------------------------------------
// I-31 · Lead-time rule (≤ 365 days) — Fachkonzept ch. 5.3
// ---------------------------------------------------------------------------
describe('I-31 lead-time rule', () => {
  it('defaults the lead time to 365 days (config I-01)', () => {
    expect(LEAD_TIME_DAYS).toBe(365);
  });

  it('derives the delivery start as the day after the pre-contract ends', () => {
    expect(resolveDeliveryStart({ intakeDate: '2026-01-01', vorvertragEnde: '2027-10-01', leadTimeDays: 365 })).toBe(
      '2027-10-02',
    );
  });

  it('prefers an explicit requested delivery start over the pre-contract end', () => {
    expect(
      resolveDeliveryStart({
        intakeDate: '2026-01-01',
        vorvertragEnde: '2027-10-01',
        requestedDeliveryStart: '2027-05-01',
        leadTimeDays: 365,
      }),
    ).toBe('2027-05-01');
  });

  it('admits a contract whose pre-contract runs exactly the lead time', () => {
    // delivery start 2027-10-02, intake 2026-10-02 ⇒ exactly 365 days.
    const r = evaluateLeadTime({ intakeDate: '2026-10-02', vorvertragEnde: '2027-10-01', leadTimeDays: LEAD_TIME_DAYS });
    expect(r.leadDays).toBe(365);
    expect(r.admissible).toBe(true);
    expect(r.rejectionReason).toBeNull();
  });

  it('rejects a contract taken one day too early with the exact reason', () => {
    // one day earlier than the first admissible day ⇒ 366 days > 365.
    const r = evaluateLeadTime({ intakeDate: '2026-10-01', vorvertragEnde: '2027-10-01', leadTimeDays: LEAD_TIME_DAYS });
    expect(r.leadDays).toBe(366);
    expect(r.admissible).toBe(false);
    expect(r.rejectionReason).toBe(LEAD_TIME_REJECTION_REASON);
    expect(r.rejectionReason).toBe('Vorlaufzeit zu lang');
  });

  it('BINDING worked example: pre-contract ending 01.10.2027 ⇒ first admissible 02.10.2026', () => {
    const r = evaluateLeadTime({ intakeDate: '2025-01-01', vorvertragEnde: '2027-10-01', leadTimeDays: LEAD_TIME_DAYS });
    expect(r.firstAdmissibleDate).toBe('2026-10-02');
    // Taken on the intake day 2025-01-01 it is far too early ⇒ rejected …
    expect(r.admissible).toBe(false);
    expect(r.rejectionReason).toBe('Vorlaufzeit zu lang');
    // … and it first becomes admissible exactly on 02.10.2026.
    const onFirstDay = evaluateLeadTime({
      intakeDate: r.firstAdmissibleDate!,
      vorvertragEnde: '2027-10-01',
      leadTimeDays: LEAD_TIME_DAYS,
    });
    expect(onFirstDay.admissible).toBe(true);
    const dayBefore = evaluateLeadTime({
      intakeDate: addDays(r.firstAdmissibleDate!, -1),
      vorvertragEnde: '2027-10-01',
      leadTimeDays: LEAD_TIME_DAYS,
    });
    expect(dayBefore.admissible).toBe(false);
  });

  it('honours a reconfigured lead time (config-driven, I-01)', () => {
    // With a 30-day lead time the same intake is admissible only much later.
    const r = evaluateLeadTime({ intakeDate: '2026-10-02', vorvertragEnde: '2027-10-01', leadTimeDays: 30 });
    expect(r.admissible).toBe(false);
    expect(r.firstAdmissibleDate).toBe(addDays('2027-10-02', -30));
  });

  it('does not fire when there is no pre-contract / delivery reference', () => {
    const r = evaluateLeadTime({ intakeDate: '2026-10-02', vorvertragEnde: null, leadTimeDays: LEAD_TIME_DAYS });
    expect(r.admissible).toBe(true);
    expect(r.deliveryStart).toBeNull();
    expect(r.firstAdmissibleDate).toBeNull();
  });

  it('date helpers work across a year boundary and a non-leap February', () => {
    expect(addDays('2026-10-02', 365)).toBe('2027-10-02');
    expect(daysBetween('2026-10-02', '2027-10-02')).toBe(365);
  });
});
