import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Wiedervorlage } from '../entities/wiedervorlage.entity';
import { AppUser } from '../entities/app-user.entity';
import { BusinessConfigService } from '../config-store/business-config.service';
import { AuditService } from '../audit/audit.service';
import { EMAIL_SENDER } from './email-sender';
import { WiedervorlageService } from './wiedervorlage.service';

const auditMock = () => ({ log: jest.fn().mockResolvedValue(undefined) });

function buildWiedervorlageRepo(store: Wiedervorlage[]) {
  return {
    create: (x: Partial<Wiedervorlage>) => ({ ...x }) as Wiedervorlage,
    save: jest.fn().mockImplementation((x: Wiedervorlage) => {
      if (!x.id) {
        x.id = `w${store.length + 1}`;
        store.push(x);
      }
      return Promise.resolve(x);
    }),
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockImplementation(({ where }: any) => {
      let rows = [...store];
      if (where?.status) rows = rows.filter((r) => r.status === where.status);
      // LessThanOrEqual(asOf) carries its value under a private symbol; emulate by
      // reading the operator's `_value` used by the service's processDue filter.
      if (where?.faelligAm && typeof where.faelligAm === 'object') {
        const val = (where.faelligAm as any)._value ?? (where.faelligAm as any).value;
        rows = rows.filter((r) => r.faelligAm <= val);
      }
      return Promise.resolve(rows);
    }),
  };
}

describe('WiedervorlageService (I-31/I-32)', () => {
  const config = { resolve: jest.fn().mockResolvedValue(FALLBACK_LEAD_TIME()) } as unknown as BusinessConfigService;

  function FALLBACK_LEAD_TIME() {
    return 365;
  }

  async function build(store: Wiedervorlage[], email: { send: jest.Mock }) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WiedervorlageService,
        { provide: getRepositoryToken(Wiedervorlage), useValue: buildWiedervorlageRepo(store) },
        {
          provide: getRepositoryToken(AppUser),
          useValue: { find: jest.fn().mockResolvedValue([{ email: 'founder@blitzon.de', rolle: 'admin_gf' }, { email: 'back@blitzon.de', rolle: 'backoffice' }]) },
        },
        { provide: BusinessConfigService, useValue: config },
        { provide: AuditService, useValue: auditMock() },
        { provide: EMAIL_SENDER, useValue: email },
      ],
    }).compile();
    return module.get(WiedervorlageService);
  }

  it('creates a follow-up for the first admissible day on a lead-time breach (binding example)', async () => {
    const store: Wiedervorlage[] = [];
    const email = { send: jest.fn() };
    const svc = await build(store, email);

    const evalResult = await svc.evaluateIntake(
      { intakeDate: '2025-01-01', vorvertragEnde: '2027-10-01', swaOrderNumber: 'A-1', kunde: 'Müller GmbH' },
      'u1',
    );
    expect(evalResult.admissible).toBe(false);
    expect(evalResult.rejectionReason).toBe('Vorlaufzeit zu lang');
    expect(evalResult.firstAdmissibleDate).toBe('2026-10-02');
    expect(evalResult.wiedervorlage).not.toBeNull();
    expect(store).toHaveLength(1);
    expect(store[0].faelligAm).toBe('2026-10-02');
    expect(store[0].status).toBe('offen');
    // No email is sent at intake time — only when the follow-up becomes due.
    expect(email.send).not.toHaveBeenCalled();
  });

  it('creates no follow-up for an admissible intake', async () => {
    const store: Wiedervorlage[] = [];
    const svc = await build(store, { send: jest.fn() });
    const r = await svc.evaluateIntake({ intakeDate: '2026-10-02', vorvertragEnde: '2027-10-01' }, 'u1');
    expect(r.admissible).toBe(true);
    expect(r.wiedervorlage).toBeNull();
    expect(store).toHaveLength(0);
  });

  it('emails Founder/Backoffice when the follow-up becomes due, exactly once', async () => {
    const store: Wiedervorlage[] = [];
    const email = { send: jest.fn().mockResolvedValue({ id: 'm1', gesendetAm: new Date() }) };
    const svc = await build(store, email);
    await svc.evaluateIntake({ intakeDate: '2025-01-01', vorvertragEnde: '2027-10-01', kunde: 'Müller GmbH' }, 'u1');

    // Not due the day before.
    const before = await svc.processDue('2026-10-01', 'system');
    expect(before.gesendet).toBe(0);
    expect(email.send).not.toHaveBeenCalled();

    // Due on the first admissible day → one email to both recipients.
    const on = await svc.processDue('2026-10-02', 'system');
    expect(on.gesendet).toBe(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0].to).toEqual(['founder@blitzon.de', 'back@blitzon.de']);
    expect(store[0].status).toBe('benachrichtigt');

    // Re-processing does not double-send.
    const again = await svc.processDue('2026-11-01', 'system');
    expect(again.gesendet).toBe(0);
    expect(email.send).toHaveBeenCalledTimes(1);
  });
});
