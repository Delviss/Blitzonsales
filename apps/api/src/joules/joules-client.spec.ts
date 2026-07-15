import { JoulesApiClient, JoulesApiError } from './joules-client';

const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);

const makeClient = (fetchImpl: jest.Mock, over: Partial<ConstructorParameters<typeof JoulesApiClient>[0]> = {}) =>
  new JoulesApiClient({
    baseUrl: 'https://service.billig-will-ich.de/service/v2/',
    credential: { mode: 'apikey', apiKey: 'test-key' },
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleep: () => Promise.resolve(),
    ...over,
  });

describe('JoulesApiClient', () => {
  it('reports not configured without a credential', () => {
    const c = new JoulesApiClient({ baseUrl: 'https://x', credential: { mode: 'none' } });
    expect(c.isConfigured).toBe(false);
  });

  it('throws when calling an unconfigured client', async () => {
    const c = new JoulesApiClient({ baseUrl: 'https://x', credential: { mode: 'none' } });
    await expect(c.client('1')).rejects.toBeInstanceOf(JoulesApiError);
  });

  it('sends the api-key header and returns the parsed nested body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json({ contractData: { id: 1, order_id: 'SWG1' } }));
    const c = makeClient(fetchImpl);
    const result = await c.client('1');
    expect(result.contractData?.order_id).toBe('SWG1');
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://service.billig-will-ich.de/service/v2/clients/1');
    expect(opts.method).toBe('GET');
    expect((opts.headers as Record<string, string>)['api-key']).toBe('test-key');
  });

  it('fetches the status catalogue with the OPTIONS method', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json([{ statusName: 'In Belieferung' }]));
    const c = makeClient(fetchImpl, { credential: { mode: 'basic', user: 'u', pass: 'p' } });
    const result = await c.statuses();
    expect(result[0].statusName).toBe('In Belieferung');
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://service.billig-will-ich.de/service/v2/clients/statuses');
    expect(opts.method).toBe('OPTIONS');
    expect((opts.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
  });

  it('resolves user and organization names via the lookup endpoints', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({ userData: { id: 341, name: 'Sean Tyler Kreuzer' } }))
      .mockResolvedValueOnce(json({ organizationData: { id: 7, name: 'Team Augsburg' } }));
    const c = makeClient(fetchImpl);
    const user = await c.user(341);
    const org = await c.organization(7);
    expect(user.userData?.name).toBe('Sean Tyler Kreuzer');
    expect(org.organizationData?.name).toBe('Team Augsburg');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://service.billig-will-ich.de/service/v2/user/341');
    expect(fetchImpl.mock.calls[1][0]).toBe('https://service.billig-will-ich.de/service/v2/organizations/7');
  });

  it('retries on a 500 and then succeeds', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({ message: 'boom' }, { status: 500 }))
      .mockResolvedValueOnce(json({ id: '1' }));
    const c = makeClient(fetchImpl);
    const result = await c.client('1');
    expect(result.id).toBe('1');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries on a 429 honouring Retry-After, and takes the numeric status id', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({}, { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(json([[{ id: 1 }, { id: 2 }]]));
    const c = makeClient(fetchImpl, { sleep });
    const result = await c.clientIds(5);
    expect(result).toEqual([[{ id: 1 }, { id: 2 }]]);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://service.billig-will-ich.de/service/v2/clients/ids/5');
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('does not retry a 404 and throws a JoulesApiError', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json({ message: 'not found' }, { status: 404 }));
    const c = makeClient(fetchImpl);
    await expect(c.client('missing')).rejects.toMatchObject({ status: 404 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries network errors and gives up after maxRetries', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const c = makeClient(fetchImpl, { maxRetries: 2 });
    await expect(c.consumption('1')).rejects.toBeInstanceOf(JoulesApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
