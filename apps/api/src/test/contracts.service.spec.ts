import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Rolle } from '@blitzon/shared';
import { ContractsService } from '../contracts/contracts.service';
import { Contract } from '../entities/contract.entity';

describe('ContractsService RBAC scoping', () => {
  let service: ContractsService;
  let find: jest.Mock;

  beforeEach(async () => {
    find = jest.fn().mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [ContractsService, { provide: getRepositoryToken(Contract), useValue: { find, findOne: jest.fn() } }],
    }).compile();
    service = module.get(ContractsService);
  });

  it('forces repId to the caller\'s own rep for Aussendienst, ignoring any repId query param', async () => {
    await service.findAll(
      { sub: 'u1', rolle: Rolle.Aussendienst, organisationId: 'org1', repId: 'rep-self' },
      'rep-someone-else',
    );
    expect(find.mock.calls[0][0].where).toMatchObject({ repId: 'rep-self' });
  });

  it('cannot leak all contracts if Aussendienst has no linked rep', async () => {
    await service.findAll({ sub: 'u1', rolle: Rolle.Aussendienst, organisationId: 'org1', repId: null });
    expect(find.mock.calls[0][0].where).toMatchObject({ repId: '__none__' });
  });

  it('confines Teamleiter to their own organisation', async () => {
    await service.findAll({ sub: 'u2', rolle: Rolle.Teamleiter, organisationId: 'org1', repId: null });
    expect(find.mock.calls[0][0].where).toMatchObject({ organisationId: 'org1' });
  });

  it('allows Admin/Backoffice unrestricted access with optional repId filter', async () => {
    await service.findAll({ sub: 'u3', rolle: Rolle.AdminGf, organisationId: null, repId: null }, 'rep-x');
    expect(find.mock.calls[0][0].where).toEqual({ repId: 'rep-x' });
  });
});
