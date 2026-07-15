import { SyncRunStatus } from '@blitzon/shared';
import { JoulesSyncService } from './joules-sync.service';
import { JoulesApiError } from './joules-client';

/** Realistic nested doc.yaml payload the mocked client serves. */
const nestedClient = {
  contractData: {
    id: 1,
    contract_nr: 'JC1',
    order_id: 'SWG1',
    client_type: 0,
    status: 5,
    status_label: 'In Belieferung',
  },
  salesData: { user_id: 341, organization_id: 7 },
  productData: { tariff_energy_type: 1, previous_volume: 3000 },
  customerData: { first_name: 'Max', last_name: 'Muster' },
};

function makeService(clientOver: Record<string, any> = {}, statusIds: string[] = ['5']) {
  const client = {
    isConfigured: true,
    clientIds: jest.fn().mockResolvedValue([[{ id: 1, contract_nr: 'JC1' }]]),
    client: jest.fn().mockResolvedValue(nestedClient),
    consumption: jest.fn().mockResolvedValue([{ consumption: 3000, end_date: '2026-06-30' }]),
    cancellation: jest.fn().mockResolvedValue([]),
    user: jest.fn().mockResolvedValue({ userData: { id: 341, name: 'Sean Tyler Kreuzer' } }),
    organization: jest.fn().mockResolvedValue({ organizationData: { id: 7, name: 'Team Augsburg' } }),
    ...clientOver,
  };
  const syncRepo = {
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => ({ id: x.id ?? 'run-1', ...x })),
    find: jest.fn(),
  };
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
    upsert as any,
    archive as any,
    audit as any,
    statusIds,
  );
  return { svc, client, syncRepo, upsert, archive, audit };
}

describe('JoulesSyncService', () => {
  it('does not touch the API when unconfigured and reports nicht_konfiguriert', async () => {
    const { svc, client, upsert } = makeService({ isConfigured: false });
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.NichtKonfiguriert);
    expect(client.clientIds).not.toHaveBeenCalled();
    expect(upsert.upsertBatch).not.toHaveBeenCalled();
  });

  it('reports nicht_konfiguriert with a JOULES_STATUS_IDS hint when no status ids are set', async () => {
    const { svc, client } = makeService({}, []);
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.NichtKonfiguriert);
    expect(run.meldung).toContain('JOULES_STATUS_IDS');
    expect(client.clientIds).not.toHaveBeenCalled();
  });

  it('drives the delta sync: status-id → ids → clients → name lookups → archive → upsert', async () => {
    const { svc, client, upsert, archive } = makeService();
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(client.clientIds).toHaveBeenCalledWith('5');
    expect(client.client).toHaveBeenCalledWith('1');
    expect(client.user).toHaveBeenCalledWith('341');
    expect(client.organization).toHaveBeenCalledWith('7');
    expect(archive.archive).toHaveBeenCalledTimes(1);
    const records = upsert.upsertBatch.mock.calls[0][0];
    expect(records).toHaveLength(1);
    expect(records[0].view.swaOrderNumber).toBe('SWG1');
    expect(records[0].view.repName).toBe('Sean Tyler Kreuzer');
    expect(records[0].view.orgName).toBe('Team Augsburg');
    expect(run.status).toBe(SyncRunStatus.Ok);
    expect(run.erstellt).toBe(1);
  });

  it('caches user/org lookups across clients in one run', async () => {
    const { svc, client } = makeService({
      clientIds: jest.fn().mockResolvedValue([[{ id: 1 }, { id: 2 }]]),
      client: jest
        .fn()
        .mockResolvedValueOnce(nestedClient)
        .mockResolvedValueOnce({ ...nestedClient, contractData: { ...nestedClient.contractData, id: 2, order_id: 'SWG2' } }),
    });
    await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(client.user).toHaveBeenCalledTimes(1);
    expect(client.organization).toHaveBeenCalledTimes(1);
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

  it('tolerates a 403 on the user lookup and lets the record gate as unknown rep', async () => {
    const { svc, upsert } = makeService({
      user: jest.fn().mockRejectedValue(new JoulesApiError('forbidden', 403)),
    });
    const run = await svc.runSync({ akteur: 'u1', ausloeser: 'manual' });
    expect(run.status).toBe(SyncRunStatus.Ok);
    const records = upsert.upsertBatch.mock.calls[0][0];
    expect(records[0].view.repName).toBeNull();
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
