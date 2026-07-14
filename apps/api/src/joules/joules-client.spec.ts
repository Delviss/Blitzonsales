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

  it('sends the api-key header and returns the parsed body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json({ id: '1', orderNumber: 'SWG1' }));
    const c = makeClient(fetchImpl);
    const result = await c.client('1');
    expect(result.orderNumber).toBe('SWG1');
    const [url, opts] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://service.billig-will-ich.de/service/v2/clients/1');
    expect((opts.headers as Record<string, string>)['api-key']).toBe('test-key');
  });

  it('sends a Basic auth header when configured for basic', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json([{ code: 'x' }]));
    const c = makeClient(fetchImpl, { credential: { mode: 'basic', user: 'u', pass: 'p' } });
    await c.statuses();
    const [, opts] = fetchImpl.mock.calls[0];
    expect((opts.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
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

  it('retries on a 429 honouring Retry-After', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(json({}, { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(json({ ids: ['a', 'b'] }));
    const c = makeClient(fetchImpl, { sleep });
    const result = await c.clientIds('In Belieferung');
    expect(result).toEqual({ ids: ['a', 'b'] });
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
