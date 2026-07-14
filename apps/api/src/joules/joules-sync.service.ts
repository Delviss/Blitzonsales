import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IngestionSource, SyncRunStatus } from '@blitzon/shared';
import { SyncRun } from '../entities/sync-run.entity';
import { AuditService } from '../audit/audit.service';
import { StatusMasterService } from '../status-master/status-master.service';
import { ContractUpsertService, UpsertRecord } from '../ingestion/contract-upsert.service';
import { IngestionArchiveService } from '../ingestion/ingestion-archive.service';
import { JoulesApiClient } from './joules-client';
import { JOULES_CLIENT } from './joules.tokens';
import { mapJoulesClient } from './joules-mapper';
import { JoulesCancellation, JoulesClientIds, JoulesConsumption } from './joules-schemas';

export interface SyncOptions {
  akteur: string | null;
  ausloeser: 'manual' | 'scheduled';
  /** Explicit status filter; defaults to every known status (I-06). */
  statuses?: string[];
}

function extractIds(payload: JoulesClientIds): string[] {
  if (Array.isArray(payload)) return payload.map(String);
  if (payload?.ids) return payload.ids.map(String);
  if (payload?.clients) return payload.clients.map(String);
  return [];
}

/**
 * Joules / SWA delta sync (I-09, Fachkonzept ch. 11.3 / 12.1).
 *
 * Driven by `GET /clients/ids/{status}`: for every status it collects the client
 * ids, fetches each `/clients/{id}` + `/consumption/{id}` (+ `/cancellation/{id}`
 * when present), maps them (`joules-mapper`) and funnels them through the shared
 * order-number upsert (`ContractUpsertService`) so contracts update idempotently,
 * status history + financial events are appended (I-03) and reversals surface
 * immediately. Every run archives the raw payloads (I-10) and records what
 * changed in a `sync_run` row.
 *
 * The client is externally blocked on a test-tenant credential (I-08): when it is
 * not configured, a run completes with status `nicht_konfiguriert` and a clear
 * message instead of throwing, so the rest of the system is never gated on it.
 */
@Injectable()
export class JoulesSyncService {
  private readonly logger = new Logger(JoulesSyncService.name);

  constructor(
    @Inject(JOULES_CLIENT) private readonly client: JoulesApiClient,
    @InjectRepository(SyncRun) private readonly syncRepo: Repository<SyncRun>,
    private readonly statusMaster: StatusMasterService,
    private readonly upsert: ContractUpsertService,
    private readonly archive: IngestionArchiveService,
    private readonly audit: AuditService,
  ) {}

  configured(): boolean {
    return this.client.isConfigured;
  }

  async runSync(opts: SyncOptions): Promise<SyncRun> {
    const asOf = new Date().toISOString().slice(0, 10);
    const statuses = opts.statuses ?? (await this.statusMaster.knownCodes(asOf));

    const run = await this.syncRepo.save(
      this.syncRepo.create({
        typ: 'joules',
        status: SyncRunStatus.Ok,
        ausloeser: opts.ausloeser,
        statusFilter: statuses,
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

    try {
      // 1) Delta driver: collect unique client ids across the status filter.
      const ids = new Set<string>();
      for (const status of statuses) {
        const payload = await this.client.clientIds(status);
        for (const id of extractIds(payload)) ids.add(id);
      }

      // 2) Fetch + map each client (+ consumption + cancellation).
      const records: UpsertRecord[] = [];
      const rawPayloads: unknown[] = [];
      for (const id of ids) {
        const client = await this.client.client(id);
        const consumption = await this.optional<JoulesConsumption>(() => this.client.consumption(id));
        const cancellation = await this.optional<JoulesCancellation>(() => this.client.cancellation(id));
        rawPayloads.push({ client, consumption, cancellation });
        records.push(mapJoulesClient(client, consumption, cancellation));
      }

      // 3) Archive the raw payloads byte-for-byte (I-10) before writing anything.
      const archived = await this.archive.archive({
        quelle: IngestionSource.Api,
        referenz: `GET /clients/ids/{status} × ${statuses.length}`,
        akteur: opts.akteur ?? 'system',
        contentType: 'application/json',
        rohdaten: JSON.stringify(rawPayloads),
        satzAnzahl: records.length,
        meta: { statuses, ausloeser: opts.ausloeser },
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
