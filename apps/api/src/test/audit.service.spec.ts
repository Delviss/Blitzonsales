import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit/audit.service';
import { AuditLog } from '../entities/audit-log.entity';

const mockSave = jest.fn().mockResolvedValue({});
const mockCreate = jest.fn().mockImplementation((d) => d);

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: { save: mockSave, create: mockCreate },
        },
      ],
    }).compile();
    service = module.get(AuditService);
    jest.clearAllMocks();
  });

  it('writes an audit entry on create', async () => {
    await service.log({ entity: 'organisation', entityId: 'uuid-1', aktion: 'create', neu: { name: 'Test' }, userId: 'user-1' });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ entity: 'organisation', aktion: 'create' }));
    expect(mockSave).toHaveBeenCalled();
  });

  it('writes alt and neu on update', async () => {
    await service.log({ entity: 'produkt', entityId: 'uuid-2', aktion: 'update', alt: { satz: 40 }, neu: { satz: 50 }, userId: 'user-2' });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ alt: { satz: 40 }, neu: { satz: 50 } }));
  });
});
