import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DatenschutzService } from '../datenschutz/datenschutz.service';
import { AppUser } from '../entities/app-user.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Contract } from '../entities/contract.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { AuditService } from '../audit/audit.service';

describe('DatenschutzService', () => {
  let service: DatenschutzService;
  let userFindOne: jest.Mock;
  let userSave: jest.Mock;
  let repFindOne: jest.Mock;
  let repSave: jest.Mock;
  let contractFind: jest.Mock;
  let lineFind: jest.Mock;
  let auditLog: jest.Mock;

  beforeEach(async () => {
    userFindOne = jest.fn().mockResolvedValue({ id: 'u1', email: 'rep@blitzon.de', password: 'hash', rolle: 'aussendienst', organisationId: 'org1', repId: 'rep1', twofaEnabled: false });
    userSave = jest.fn().mockImplementation(u => Promise.resolve(u));
    repFindOne = jest.fn().mockResolvedValue({ id: 'rep1', name: 'Anna Fuchs', iban: 'DE123', organisationId: 'org1', aktiv: true });
    repSave = jest.fn().mockImplementation(r => Promise.resolve(r));
    contractFind = jest.fn().mockResolvedValue([{ id: 'c1', joulesId: 'SWG1' }]);
    lineFind = jest.fn().mockResolvedValue([{ id: 'l1', betrag: 50 }]);
    auditLog = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatenschutzService,
        { provide: getRepositoryToken(AppUser), useValue: { findOne: userFindOne, save: userSave } },
        { provide: getRepositoryToken(SalesRep), useValue: { findOne: repFindOne, save: repSave } },
        { provide: getRepositoryToken(Contract), useValue: { find: contractFind } },
        { provide: getRepositoryToken(CommissionLine), useValue: { find: lineFind } },
        { provide: AuditService, useValue: { log: auditLog } },
      ],
    }).compile();
    service = module.get(DatenschutzService);
  });

  it('exports the linked rep, contracts and commission lines for a rep-linked user', async () => {
    const result = await service.exportPersonalData('u1');
    expect(result.verkaeufer).toMatchObject({ id: 'rep1', name: 'Anna Fuchs' });
    expect(result.vertraege).toHaveLength(1);
    expect(result.provisionszeilen).toHaveLength(1);
  });

  it('pseudonymizes email/rep name on erasure without touching contract/commission records', async () => {
    const result = await service.requestErasure('u1', 'admin1');
    expect(result.status).toBe('pseudonymisiert');
    expect(userSave.mock.calls[0][0].email).toBe('geloescht-u1@blitzon.invalid');
    expect(repSave.mock.calls[0][0].name).toContain('anonymisiert');
    expect(repSave.mock.calls[0][0].iban).toBeNull();
    expect(contractFind).not.toHaveBeenCalled();
    expect(lineFind).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ entity: 'app_user', aktion: 'loeschantrag', userId: 'admin1' }));
  });
});
