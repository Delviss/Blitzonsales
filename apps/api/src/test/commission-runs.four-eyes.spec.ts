import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { CommissionRunsService } from '../commissions/commission-runs.service';
import { CommissionRun } from '../entities/commission-run.entity';
import { CommissionRule } from '../entities/commission-rule.entity';
import { CommissionLine } from '../entities/commission-line.entity';
import { Contract } from '../entities/contract.entity';
import { AuditService } from '../audit/audit.service';

describe('CommissionRunsService: four-eyes approval', () => {
  let service: CommissionRunsService;
  let runFindOne: jest.Mock;
  let runSave: jest.Mock;
  let findOneSpy: jest.SpyInstance;

  beforeEach(async () => {
    runFindOne = jest.fn();
    runSave = jest.fn().mockImplementation(run => Promise.resolve(run));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommissionRunsService,
        { provide: getRepositoryToken(CommissionRun), useValue: { findOne: runFindOne, save: runSave, create: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(CommissionRule), useValue: {} },
        { provide: getRepositoryToken(CommissionLine), useValue: { find: jest.fn().mockResolvedValue([]) } },
        { provide: getRepositoryToken(Contract), useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(CommissionRunsService);
    findOneSpy = jest.spyOn(service, 'findOne').mockResolvedValue({ run: {}, lines: [], summary: {} } as any);
  });

  afterEach(() => findOneSpy.mockRestore());

  it('blocks the creator of a run from also being the one who freigibt it', async () => {
    runFindOne.mockResolvedValue({ id: 'run1', status: 'entwurf', createdBy: 'user-A' });
    await expect(service.freigeben('run1', 'user-A')).rejects.toThrow(ConflictException);
    expect(runSave).not.toHaveBeenCalled();
  });

  it('allows a different user to freigeben the run', async () => {
    runFindOne.mockResolvedValue({ id: 'run1', status: 'entwurf', createdBy: 'user-A' });
    await service.freigeben('run1', 'user-B');
    expect(runSave).toHaveBeenCalled();
  });

  it('allows freigeben when createdBy is unset (legacy runs predating four-eyes tracking)', async () => {
    runFindOne.mockResolvedValue({ id: 'run1', status: 'entwurf', createdBy: null });
    await service.freigeben('run1', 'user-A');
    expect(runSave).toHaveBeenCalled();
  });
});
