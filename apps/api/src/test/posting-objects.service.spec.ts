import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CollectionsStatus } from '@blitzon/shared';
import { StornoAccountService } from '../posting-objects/storno-account.service';
import { ClawbackService } from '../posting-objects/clawback.service';
import { SalesRep } from '../entities/sales-rep.entity';
import { ClawbackReceivable } from '../entities/clawback-receivable.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { LedgerService } from '../config-store/ledger.service';
import { AuditService } from '../audit/audit.service';

const ledgerMock = () => ({ appendFinancial: jest.fn().mockResolvedValue(undefined) });
const auditMock = () => ({ log: jest.fn().mockResolvedValue(undefined) });

// ---------------------------------------------------------------------------
// I-23 · Storno account posting object (ch. 10.1 breakdown)
// ---------------------------------------------------------------------------
describe('StornoAccountService (I-23)', () => {
  it('exposes the full ch. 10.1 breakdown incl. freely-available = balance − open receivables', async () => {
    const rep: Partial<SalesRep> = {
      id: 'r1', name: 'Rep One',
      stornoKontoSaldo: 1000, stornoPrivatEinbehalt: 800, stornoGewerbeEinbehalt: 400,
      stornoClawbackGenutzt: 150, stornoFreigegeben: 50,
    };
    const clawbackQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ repId: 'r1', offen: '300' }]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StornoAccountService,
        { provide: getRepositoryToken(SalesRep), useValue: { find: jest.fn().mockResolvedValue([rep]), findOne: jest.fn().mockResolvedValue(rep) } },
        { provide: getRepositoryToken(ClawbackReceivable), useValue: { createQueryBuilder: () => clawbackQb } },
        { provide: LedgerService, useValue: ledgerMock() },
        { provide: AuditService, useValue: auditMock() },
      ],
    }).compile();
    const svc = module.get(StornoAccountService);

    const [view] = await svc.summary('r1');
    expect(view.gesamtsaldo).toBe(1000);
    expect(view.privatAnteil).toBe(800);
    expect(view.gewerbeAnteil).toBe(400);
    expect(view.genutzteClawbacks).toBe(150);
    expect(view.manuellFreigegeben).toBe(50);
    expect(view.offeneForderungen).toBe(300);
    expect(view.freiVerfuegbar).toBe(700); // 1000 − 300
  });

  it('requires amount, date, approver and reason for a manual release; audits + ledgers it (I-26)', async () => {
    const rep: Partial<SalesRep> = {
      id: 'r1', name: 'Rep One',
      stornoKontoSaldo: 1000, stornoPrivatEinbehalt: 1000, stornoGewerbeEinbehalt: 0,
      stornoClawbackGenutzt: 0, stornoFreigegeben: 0,
    };
    const increment = jest.fn().mockImplementation((_id, field: string, delta: number) => {
      if (field === 'stornoKontoSaldo') (rep as any).stornoKontoSaldo += delta;
      return Promise.resolve(undefined);
    });
    const clawbackQb = {
      select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
    const ledger = ledgerMock();
    const audit = auditMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StornoAccountService,
        { provide: getRepositoryToken(SalesRep), useValue: { findOne: jest.fn().mockResolvedValue(rep), find: jest.fn().mockResolvedValue([rep]), increment } },
        { provide: getRepositoryToken(ClawbackReceivable), useValue: { createQueryBuilder: () => clawbackQb } },
        { provide: LedgerService, useValue: ledger },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    const svc = module.get(StornoAccountService);

    // A missing reason is rejected — storno credit is never released without one.
    await expect(svc.release('r1', { betrag: 200, datum: '2026-07-01', genehmigtVon: 'GF Müller', grund: '' }, 'u1')).rejects.toThrow();
    // Over-balance is rejected.
    await expect(svc.release('r1', { betrag: 5000, grund: 'x' }, 'u1')).rejects.toThrow();

    const view = await svc.release('r1', { betrag: 300, datum: '2026-07-01', genehmigtVon: 'GF Müller', grund: 'Krankheit überbrücken' }, 'u1');
    expect(increment).toHaveBeenCalledWith({ id: 'r1' }, 'stornoKontoSaldo', -300);
    expect(increment).toHaveBeenCalledWith({ id: 'r1' }, 'stornoFreigegeben', 300);
    // Ledger records the negative release with the audit trail baked into the reason.
    const ledgerCall = ledger.appendFinancial.mock.calls.at(-1)[0];
    expect(ledgerCall.typ).toBe('storno_freigabe');
    expect(ledgerCall.betrag).toBe(-300);
    expect(ledgerCall.begruendung).toContain('2026-07-01');
    expect(ledgerCall.begruendung).toContain('GF Müller');
    expect(ledgerCall.begruendung).toContain('Krankheit');
    // Audit captures the structured release.
    const auditCall = audit.log.mock.calls.at(-1)[0];
    expect(auditCall.aktion).toBe('storno_freigabe');
    expect(auditCall.neu).toMatchObject({ betrag: 300, datum: '2026-07-01', genehmigtVon: 'GF Müller' });
    expect(view.gesamtsaldo).toBe(700);
  });

  it('caps a clawback offset at the current storno balance and reports what it took', async () => {
    const rep: Partial<SalesRep> = { id: 'r1', stornoKontoSaldo: 200 };
    const increment = jest.fn().mockResolvedValue(undefined);
    const ledger = ledgerMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StornoAccountService,
        { provide: getRepositoryToken(SalesRep), useValue: { findOne: jest.fn().mockResolvedValue(rep), increment } },
        { provide: getRepositoryToken(ClawbackReceivable), useValue: {} },
        { provide: LedgerService, useValue: ledger },
        { provide: AuditService, useValue: auditMock() },
      ],
    }).compile();
    const svc = module.get(StornoAccountService);

    const applied = await svc.applyClawbackOffset('r1', 500, null, 'u1', 'test');
    expect(applied).toBe(200); // capped at the balance
    expect(increment).toHaveBeenCalledWith({ id: 'r1' }, 'stornoKontoSaldo', -200);
    expect(increment).toHaveBeenCalledWith({ id: 'r1' }, 'stornoClawbackGenutzt', 200);
  });
});

// ---------------------------------------------------------------------------
// I-25 · Clawback receivable persistence + offset order
// ---------------------------------------------------------------------------
describe('ClawbackService (I-25)', () => {
  function build(rep: Partial<SalesRep>, openRetention: number) {
    const saved: any[] = [];
    const clawRepo = {
      create: (x: any) => x,
      save: jest.fn().mockImplementation((x) => { saved.push(x); return Promise.resolve({ id: 'cb1', ...x }); }),
    };
    const lineQb = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ sum: String(openRetention) }),
    };
    const storno = { applyClawbackOffset: jest.fn().mockResolvedValue(0) };
    return { clawRepo, lineQb, storno, saved };
  }

  it('passes through causer share and offsets storno → current → open retention in order', async () => {
    const rep: Partial<SalesRep> = { id: 'r1', stornoKontoSaldo: 300, austrittsdatum: null };
    const { clawRepo, lineQb, storno } = build(rep, 1000);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClawbackService,
        { provide: getRepositoryToken(ClawbackReceivable), useValue: clawRepo },
        { provide: getRepositoryToken(SalesRep), useValue: { findOne: jest.fn().mockResolvedValue(rep) } },
        { provide: getRepositoryToken(CommissionLine), useValue: { createQueryBuilder: () => lineQb } },
        { provide: StornoAccountService, useValue: storno },
        { provide: LedgerService, useValue: ledgerMock() },
        { provide: AuditService, useValue: auditMock() },
      ],
    }).compile();
    const svc = module.get(ClawbackService);

    // €2,000 clawback × 50% = €1,000 pass-through; storno 300, current 400, retention absorbs 300.
    const row = await svc.create(
      { repId: 'r1', swaClawback: 2000, causerShare: 0.5, currentCommissionAvailable: 400, grund: 'Widerruf' },
      'u1',
    );
    expect(row.passThrough).toBe(1000);
    expect(row.offsets).toEqual([
      { target: 'storno_account', applied: 300 },
      { target: 'current_commission', applied: 400 },
      { target: 'open_retention', applied: 300 },
    ]);
    expect(row.remaining).toBe(0);
    expect(row.inkassoStatus).toBe(CollectionsStatus.Ausgeglichen);
    expect(storno.applyClawbackOffset).toHaveBeenCalledWith('r1', 300, null, 'u1', expect.any(String));
  });

  it('leaves a reconstructable remaining receivable, flagged for invoice when the rep has left', async () => {
    const rep: Partial<SalesRep> = { id: 'r1', stornoKontoSaldo: 100, austrittsdatum: '2026-05-01' };
    const { clawRepo, lineQb, storno } = build(rep, 0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClawbackService,
        { provide: getRepositoryToken(ClawbackReceivable), useValue: clawRepo },
        { provide: getRepositoryToken(SalesRep), useValue: { findOne: jest.fn().mockResolvedValue(rep) } },
        { provide: getRepositoryToken(CommissionLine), useValue: { createQueryBuilder: () => lineQb } },
        { provide: StornoAccountService, useValue: storno },
        { provide: LedgerService, useValue: ledgerMock() },
        { provide: AuditService, useValue: auditMock() },
      ],
    }).compile();
    const svc = module.get(ClawbackService);

    const row = await svc.create({ repId: 'r1', swaClawback: 2000, causerShare: 0.5 }, 'u1');
    expect(row.passThrough).toBe(1000);
    expect(row.remaining).toBe(900); // 1000 − 100 storno
    expect(row.inkassoStatus).toBe(CollectionsStatus.Rechnung); // rep departed
  });
});
