import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StatusMasterService } from '../status-master/status-master.service';
import { StatusMaster } from '../entities/status-master.entity';

/**
 * I-06 acceptance: un-released statuses never qualify, and changes are
 * valid-from versioned (recomputing a past date uses the release valid then).
 */
describe('StatusMasterService (I-06)', () => {
  let service: StatusMasterService;
  let rows: Partial<StatusMaster>[];

  beforeEach(async () => {
    rows = [
      { code: 'In Belieferung', bezeichnung: 'In Belieferung', qualifiziert: true, gueltigAb: '2026-01-01' },
      { code: 'Storno', bezeichnung: 'Storno', qualifiziert: false, gueltigAb: '2026-01-01' },
      // A later release flips "Datencheck" to qualifying from 2026-06-01 onward.
      { code: 'Datencheck', bezeichnung: 'Datencheck', qualifiziert: false, gueltigAb: '2026-01-01' },
      { code: 'Datencheck', bezeichnung: 'Datencheck', qualifiziert: true, gueltigAb: '2026-06-01' },
      // A status released only in the future must not count for earlier as-of dates.
      { code: 'Im Wechsel', bezeichnung: 'Im Wechsel', qualifiziert: true, gueltigAb: '2026-09-01' },
    ];
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatusMasterService,
        { provide: getRepositoryToken(StatusMaster), useValue: { find: jest.fn().mockResolvedValue(rows) } },
      ],
    }).compile();
    service = module.get(StatusMasterService);
  });

  it('qualifies only statuses explicitly released as qualifying', async () => {
    const codes = await service.qualifyingCodes('2026-05-31');
    expect(codes).toContain('In Belieferung');
    expect(codes).not.toContain('Storno'); // released, but not qualifying
  });

  it('never qualifies a status that is absent from the master (safety rule)', async () => {
    expect(await service.isQualifying('Ein unbekannter Status', '2026-05-31')).toBe(false);
  });

  it('resolves the release valid as-of the reference date (valid-from versioned)', async () => {
    // Before the flip: Datencheck does not qualify
    expect(await service.isQualifying('Datencheck', '2026-05-31')).toBe(false);
    // On/after the flip: Datencheck qualifies
    expect(await service.isQualifying('Datencheck', '2026-06-01')).toBe(true);
  });

  it('omits statuses whose earliest release is still in the future', async () => {
    expect(await service.isQualifying('Im Wechsel', '2026-05-31')).toBe(false);
    expect(await service.isQualifying('Im Wechsel', '2026-09-02')).toBe(true);
  });
});
