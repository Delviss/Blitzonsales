import {
  JoulesCancellation,
  JoulesClient,
  JoulesClientIdList,
  JoulesClientStatus,
  JoulesConsumption,
  JoulesOrganization,
  JoulesStatusOption,
  JoulesUser,
} from './joules-schemas';

/** How the client authenticates (I-08). Either is accepted by the API. */
export type JoulesCredential =
  | { mode: 'basic'; user: string; pass: string }
  | { mode: 'apikey'; apiKey: string }
  | { mode: 'none' };

export interface JoulesClientConfig {
  baseUrl: string;
  credential: JoulesCredential;
  /** Max retry attempts on 429 / 5xx / network error (default 3). */
  maxRetries?: number;
  /** Base backoff in ms; doubles per attempt (default 500). */
  retryBaseMs?: number;
  /** Per-request timeout in ms (default 15000). */
  timeoutMs?: number;
  /** Injected for tests. Defaults to the global fetch (Node ≥ 18). */
  fetchImpl?: typeof fetch;
  /** Injected for tests so retries don't actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** An error from a Joules API call that carries the HTTP status. */
export class JoulesApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'JoulesApiError';
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Typed client for the Joules / SWA REST API v2 (I-08). Handles HTTP Basic /
 * api-key auth, retries with exponential backoff on transient failures, and
 * rate-limit (429) handling that respects `Retry-After`.
 *
 * The client is credential-agnostic: with `mode: 'none'` it is *not configured*
 * (the issue is externally blocked on a test-tenant credential) and callers
 * should check `isConfigured` before syncing rather than making doomed calls.
 */
export class JoulesApiClient {
  private readonly baseUrl: string;
  private readonly credential: JoulesCredential;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(config: JoulesClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.credential = config.credential;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 500;
    this.timeoutMs = config.timeoutMs ?? 15000;
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as typeof fetch);
    this.sleep = config.sleep ?? defaultSleep;
  }

  /** Whether a usable credential is configured. */
  get isConfigured(): boolean {
    return this.credential.mode !== 'none' && !!this.baseUrl;
  }

  // -- endpoints -------------------------------------------------------------

  /**
   * GET /clients/ids/{status} — the id list for a status (delta-sync driver).
   * `status` is the *Joules integer status id*, not the status name; the
   * response is (nested) arrays of ClientIdSchema — see `flattenClientIds`.
   */
  clientIds(statusId: number | string): Promise<JoulesClientIdList> {
    return this.get<JoulesClientIdList>(`/clients/ids/${encodeURIComponent(String(statusId))}`);
  }

  /** GET /clients/{id} — the client / contract (nested ClientSchema). */
  client(id: string): Promise<JoulesClient> {
    return this.get<JoulesClient>(`/clients/${encodeURIComponent(id)}`);
  }

  /** GET /clients/{id}/status — the current status (id + clear text + delivery dates). */
  clientStatus(id: string): Promise<JoulesClientStatus> {
    return this.get<JoulesClientStatus>(`/clients/${encodeURIComponent(id)}/status`);
  }

  /** GET /consumption/{id} — consumption entries (the API returns an array). */
  consumption(id: string): Promise<JoulesConsumption[]> {
    return this.get<JoulesConsumption[]>(`/consumption/${encodeURIComponent(id)}`);
  }

  /** GET /cancellation/{id} — cancellations for a client (the API returns an array). */
  cancellation(id: string): Promise<JoulesCancellation[]> {
    return this.get<JoulesCancellation[]>(`/cancellation/${encodeURIComponent(id)}`);
  }

  /** GET /user/{id} — resolve a rep's name from salesData.user_id (I-11 name matching). */
  user(id: number | string): Promise<JoulesUser> {
    return this.get<JoulesUser>(`/user/${encodeURIComponent(String(id))}`);
  }

  /** GET /organizations/{id} — resolve an organisation's name from salesData.organization_id. */
  organization(id: number | string): Promise<JoulesOrganization> {
    return this.get<JoulesOrganization>(`/organizations/${encodeURIComponent(String(id))}`);
  }

  /** GET /organizations/{id}/commissionsettings — the org's commission settings. */
  commissionSettings(orgId: number | string): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/organizations/${encodeURIComponent(String(orgId))}/commissionsettings`);
  }

  /** OPTIONS /clients/statuses — the status catalogue ({statusName} entries). */
  statuses(): Promise<JoulesStatusOption[]> {
    return this.request<JoulesStatusOption[]>('OPTIONS', `/clients/statuses`);
  }

  // -- transport -------------------------------------------------------------

  private authHeaders(): Record<string, string> {
    if (this.credential.mode === 'basic') {
      const token = Buffer.from(`${this.credential.user}:${this.credential.pass}`).toString('base64');
      return { Authorization: `Basic ${token}` };
    }
    if (this.credential.mode === 'apikey') {
      return { 'api-key': this.credential.apiKey };
    }
    return {};
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /**
   * Request with retry + rate-limit handling. Retries on 429 (respecting
   * `Retry-After`), on 5xx and on network/timeout errors with exponential
   * backoff; a non-429 4xx is a client error and is not retried.
   */
  private async request<T>(method: 'GET' | 'OPTIONS', path: string): Promise<T> {
    if (!this.isConfigured) {
      throw new JoulesApiError('Joules API ist nicht konfiguriert (kein Zugang hinterlegt).', null);
    }
    const url = `${this.baseUrl}${path}`;
    const headers = { Accept: 'application/json', ...this.authHeaders() };

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { method, headers, signal: controller.signal });
        clearTimeout(timer);

        if (res.ok) {
          return (await res.json()) as T;
        }
        if (res.status === 429 && attempt < this.maxRetries) {
          await this.sleep(this.retryAfterMs(res, attempt));
          continue;
        }
        if (res.status >= 500 && attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
        const body = await this.safeBody(res);
        throw new JoulesApiError(`Joules API ${res.status} bei ${path}`, res.status, body);
      } catch (err) {
        clearTimeout(timer);
        if (err instanceof JoulesApiError) throw err;
        // Network / abort error — retry with backoff, else give up.
        lastErr = err;
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffMs(attempt));
          continue;
        }
      }
    }
    throw new JoulesApiError(
      `Joules API nicht erreichbar bei ${path}: ${(lastErr as Error)?.message ?? 'unbekannt'}`,
      null,
      lastErr,
    );
  }

  private backoffMs(attempt: number): number {
    return this.retryBaseMs * Math.pow(2, attempt);
  }

  /** Honour `Retry-After` (seconds or HTTP date); fall back to backoff. */
  private retryAfterMs(res: Response, attempt: number): number {
    const header = res.headers.get('retry-after');
    if (header) {
      const seconds = Number(header);
      if (!Number.isNaN(seconds)) return seconds * 1000;
      const date = Date.parse(header);
      if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    }
    return this.backoffMs(attempt);
  }

  private async safeBody(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
}
