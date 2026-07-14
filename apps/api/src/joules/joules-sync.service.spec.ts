import { SyncRunStatus } from '@blitzon/shared';
import { JoulesSyncService } from './joules-sync.service';
import { JoulesApiError } from './joules-client';

function makeService(clientOver: Record<string, any> = {}) {
  const client = {
    isConfigured: true,
    clientIds: jest.fn().mockResolvedValue(['1']),
    client: jest.fn().mockResolvedValue({
      id: '1',
      orderNumber: 'SWG1',
      clientType: 'privat',
      status: 'In Belieferung',
      salesRepName: 'Sean Tyler Kreuzer',
    }),
    consumption: jest.fn().mockResolvedValue({ annualConsumption: 3000 }),
    cancellation: jest.fn().mockResolvedValue({ cancelled: false }),
    ...clientOver,
  };
  const syncRepo = {
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => ({ id: x.id ?? 'run-1', ...x })),
    find: jest.fn(),
  };
  const statusMaster = { knownCodes: jest.fn().mockResolvedValue(['In Belieferung']) };
  const upsert = {
    upsertBatch: jest.fn().mockResolvedValue({ verarbeitet: 1, erstellt: 1, aktualisiert: 0, gesperrt: 0, fehlerAnzahl: 0 }),
  };
  const archive = {
    archive: jest.fn().mockResolvedValue({ id: 'arch-1' }),
    setCounts: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const svc = new JoulesSyncService(
    client as any,
    syncRepo as any,
    statusMaster as any,
    upsert as any,
    archive as any,
    audit as any,
  );
  return { svc, client, syncRepo, statusMaster, upsert, archive, audit };
}

describe('JoulesSyncService', () => {
  it('does not touch the API when unconfigured and reports nicht_konfiguriert', async () => {
    const { svc, client, upsert } = makeService({ isConfigured: false });
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.NichtKonfiguriert);
    expect(client.clientIds).not.toHaveBeenCalled();
    expect(upsert.upsertBatch).not.toHaveBeenCalled();
  });

  it('drives the delta sync: ids → clients → archive → upsert', async () => {
    const { svc, client, upsert, archive } = makeService();
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(client.clientIds).toHaveBeenCalledWith('In Belieferung');
    expect(client.client).toHaveBeenCalledWith('1');
    expect(archive.archive).toHaveBeenCalledTimes(1);
    const records = upsert.upsertBatch.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].view.swaOrderNumber).toBe('SWG1');
    expect(run.status).toBe(SyncRunStatus.Ok);
    expect(run.erstellt).toBe(1);
  });

  it('reports teilweise when records were flagged', async () => {
    const { svc, upsert } = makeService();
    upsert.upsertBatch.mockResolvedValue({ verarbeitet: 1, erstellt: 0, aktualisiert: 1, gesperrt: 1, fehlerAnzahl: 1 });
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.Teilweise);
    expect(run.fehler).toBe(1);
  });

  it('tolerates a 404 on the optional cancellation fetch', async () => {
    const { svc, client } = makeService({
      cancellation: jest.fn().mockRejectedValue(new JoulesApiError('not found', 404)),
    });
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.Ok);
    expect(client.cancellation).toHaveBeenCalled();
  });

  it('marks the run fehler when the API throws a non-404 error', async () => {
    const { svc } = makeService({
      clientIds: jest.fn().mockRejectedValue(new JoulesApiError('boom', 500)),
    });
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.Fehler);
    expect(run.meldung).toContain('boom');
  });
});
