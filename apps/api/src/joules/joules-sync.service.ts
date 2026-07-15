import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionSource, SyncRunStatus } from '@blitzon/shared';
import { SyncRun } from '../entities/sync-run.entity';
import { AuditService } from '../audit/audit.service';
import { ContractUpsertService, UpsertRecord } from '../ingestion/contract-upsert.service';
import { IngestionArchiveService } from '../ingestion/ingestion-archive.service';
import { JoulesApiClient } from './joules-client';
import { JOULES_CLIENT, JOULES_STATUS_IDS } from './joules.tokens';
import { mapJoulesClient } from './joules-mapper';
import { JoulesCancellation, JoulesConsumption, flattenClientIds } from './joules-schemas';

export interface SyncOptions {
  akteur: string | null;
  ausloeser: 'manual' | 'scheduled';
  /**
   * Explicit Joules *status ids* to sweep (the id-list endpoint takes the
   * integer status id, not the status name); defaults to the configured
   * `JOULES_STATUS_IDS`.
   */
  statusIds?: Array<number | string>;
}

/**
 * Joules / SWA delta sync (I-09, Fachkonzept ch. 11.3 / 12.1), built against
 * the authoritative doc.yaml ("Joules RESTful API v2").
 *
 * Driven by `GET /clients/ids/{status}` per configured *status id*: for every
 * id it fetches the nested `/clients/{id}` payload plus the consumption and
 * cancellation lists (each optional), resolves the rep/organisation *names*
 * from `salesData.user_id` / `organization_id` via `GET /user/{id}` /
 * `GET /organizations/{id}` (cached per run — our master data matches on
 * names, I-11), maps everything (`joules-mapper`) and funnels it through the
 * shared order-number upsert (`ContractUpsertService`) so contracts update
 * idempotently, status history + financial events are appended (I-03) and
 * approved reversals surface immediately. Every run archives the raw payloads
 * (I-10) and records what changed in a `sync_run` row.
 *
 * Two deliberate degradations instead of hard failures:
 * - no credential (I-08 external block) ⇒ run completes `nicht_konfiguriert`;
 * - no status ids configured ⇒ same, with a message naming `JOULES_STATUS_IDS`
 *   (the API's status catalogue exposes *names only*, so the numeric ids must
 *   be taken from the SWA tenant's Joules instance).
 */
@Injectable()
export class JoulesSyncService {
  private readonly logger = new Logger(JoulesSyncService.name);

  constructor(
    @Inject(JOULES_CLIENT) private readonly client: JoulesApiClient,
    @InjectRepository(SyncRun) private readonly syncRepo: Repository<SyncRun>,
    private readonly upsert: ContractUpsertService,
    private readonly archive: IngestionArchiveService,
    private readonly audit: AuditService,
    @Optional() @Inject(JOULES_STATUS_IDS) private readonly statusIds: string[] = [],
  ) {}

  configured(): boolean {
    return this.client.isConfigured;
  }

  async runSync(opts: SyncOptions): Promise<SyncRun> {
    const statusIds = (opts.statusIds ?? this.statusIds).map(String);

    const run = await this.syncRepo.save(
      this.syncRepo.create({
        typ: 'joules',
        status: SyncRunStatus.Ok,
        ausloeser: opts.ausloeser,
        statusFilter: statusIds,
        akteur: opts.akteur,
      }),
    );

    if (!this.client.isConfigured) {
      return this.finish(run, {
        status: SyncRunStatus.NichtKonfiguriert,
        meldung:
          'Joules API ist nicht konfiguriert (kein Test-Zugang hinterlegt) — Ingestion läuft bis dahin über den Excel-Import (I-12).',
      });
    }
    if (statusIds.length === 0) {
      return this.finish(run, {
        status: SyncRunStatus.NichtKonfiguriert,
        meldung:
          'Keine Joules-Status-IDs konfiguriert (JOULES_STATUS_IDS) — die ID-Listen-Abfrage benötigt die numerischen Status-IDs der SWA-Instanz.',
      });
    }

    try {
      // 1) Delta driver: collect unique client ids across the status-id sweep.
      const ids = new Set<string>();
      for (const statusId of statusIds) {
        const payload = await this.client.clientIds(statusId);
        for (const id of flattenClientIds(payload)) ids.add(id);
      }

      // 2) Fetch + map each client (+ consumption/cancellation lists), with
      //    per-run caches for the user/org name lookups.
      const userNames = new Map<string, string | null>();
      const orgNames = new Map<string, string | null>();
      const records: UpsertRecord[] = [];
      const rawPayloads: unknown[] = [];
      for (const id of ids) {
        const client = await this.client.client(id);
        const consumptions = await this.optional<JoulesConsumption[]>(() => this.client.consumption(id));
        const cancellations = await this.optional<JoulesCancellation[]>(() => this.client.cancellation(id));
        const repName = await this.resolveName(userNames, client.salesData?.user_id, (uid) =>
          this.client.user(uid).then((u) => u.userData?.name ?? null),
        );
        const orgName = await this.resolveName(orgNames, client.salesData?.organization_id, (oid) =>
          this.client.organization(oid).then((o) => o.organizationData?.name ?? null),
        );
        rawPayloads.push({ client, consumptions, cancellations, repName, orgName });
        records.push(mapJoulesClient(client, { consumptions, cancellations, repName, orgName }));
      }

      // 3) Archive the raw payloads byte-for-byte (I-10) before writing anything.
      const archived = await this.archive.archive({
        quelle: IngestionSource.Api,
        referenz: `GET /clients/ids/{status} × ${statusIds.length}`,
        akteur: opts.akteur ?? 'system',
        contentType: 'application/json',
        rohdaten: JSON.stringify(rawPayloads),
        satzAnzahl: records.length,
        meta: { statusIds, ausloeser: opts.ausloeser },
      });

      // 4) Idempotent upsert by order number through the shared write path (I-11).
      const res = await this.upsert.upsertBatch(records, {
        quelle: IngestionSource.Api,
        akteur: opts.akteur,
        archiveId: archived.id,
      });
      await this.archive.setCounts(archived.id, res.verarbeitet, res.fehlerAnzahl);

      return this.finish(run, {
        status: res.fehlerAnzahl > 0 ? SyncRunStatus.Teilweise : SyncRunStatus.Ok,
        verarbeitet: res.verarbeitet,
        erstellt: res.erstellt,
        aktualisiert: res.aktualisiert,
        fehler: res.fehlerAnzahl,
        meldung: `${ids.size} Aufträge synchronisiert, ${res.gesperrt} gesperrt.`,
      });
    } catch (err) {
      this.logger.error(`Joules-Sync fehlgeschlagen: ${(err as Error).message}`);
      return this.finish(run, { status: SyncRunStatus.Fehler, meldung: (err as Error).message });
    }
  }

  findRuns(limit = 50): Promise<SyncRun[]> {
    return this.syncRepo.find({ order: { gestartetAm: 'DESC' }, take: limit });
  }

  private async finish(
    run: SyncRun,
    patch: Partial<SyncRun> & { status: string },
  ): Promise<SyncRun> {
    Object.assign(run, patch, { beendetAm: new Date() });
    const saved = await this.syncRepo.save(run);
    await this.audit.log({
      entity: 'sync_run',
      entityId: saved.id,
      aktion: 'joules_sync',
      neu: {
        status: saved.status,
        verarbeitet: saved.verarbeitet,
        erstellt: saved.erstellt,
        aktualisiert: saved.aktualisiert,
        fehler: saved.fehler,
      },
      userId: run.akteur,
    });
    return saved;
  }

  /**
   * Resolve a user/org id to its name with a per-run cache. A missing id or a
   * failed lookup (404, or 403 when the api-key lacks the user/org scope)
   * yields null — the record then gates as unknown rep/org (I-11) instead of
   * failing the whole run.
   */
  private async resolveName(
    cache: Map<string, string | null>,
    id: number | string | null | undefined,
    lookup: (id: string) => Promise<string | null>,
  ): Promise<string | null> {
    if (id === null || id === undefined || String(id).trim() === '') return null;
    const key = String(id);
    if (cache.has(key)) return cache.get(key) ?? null;
    let name: string | null = null;
    try {
      name = await lookup(key);
    } catch (err) {
      const status = (err as { status?: number | null }).status;
      if (status !== 404 && status !== 403) throw err;
      this.logger.warn(`Joules-Lookup für ID ${key} fehlgeschlagen (${status}) — Datensatz wird zur Prüfung markiert.`);
    }
    cache.set(key, name);
    return name;
  }

  /** Run an optional fetch (consumption/cancellation) tolerating a 404. */
  private async optional<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number | null }).status;
      if (status === 404) return null;
      throw err;
    }
  }
}
