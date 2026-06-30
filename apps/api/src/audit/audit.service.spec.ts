import { AuditService } from './audit.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { AuditLog } from '../entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  const mockRepo = {
    create: jest.fn((data) => data),
    save: jest.fn(async (data) => ({ ...data, id: 'mock-uuid' })),
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
  });

  it('writes an audit log entry via object params', async () => {
    await service.log({
      entity: 'organisation',
      entityId: 'abc-123',
      aktion: 'create',
      neu: { name: 'Test Org' },
      userId: 'user-456',
    });
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'organisation', aktion: 'create' }),
    );
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('writes an audit log entry via positional params', async () => {
    await service.log('sales_rep', 'rep-1', 'update', { name: 'Old' }, { name: 'New' }, 'user-1');
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'sales_rep', aktion: 'update' }),
    );
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });

  it('handles null alt/neu gracefully', async () => {
    await service.log({ entity: 'produkt', entityId: 'p-1', aktion: 'delete', userId: null });
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
    const created = mockRepo.create.mock.calls[0][0];
    expect(created.alt).toBeNull();
    expect(created.neu).toBeNull();
  });
});
