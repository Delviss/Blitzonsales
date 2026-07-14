import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JoulesSyncService } from './joules-sync.service';

/**
 * Opt-in interval scheduler for the Joules sync (I-09: "runs on a schedule + on
 * demand"). Disabled by default — it only arms when `JOULES_SYNC_ENABLED=true`
 * and a credential is configured, so an environment without a Joules test tenant
 * (I-08 external block) never spins a doomed background loop. The on-demand
 * endpoint (`POST /api/sync/joules`) always works regardless.
 *
 * Uses a plain interval (no extra scheduler dependency); re-entrancy is guarded
 * so a slow sync never overlaps the next tick.
 */
@Injectable()
export class JoulesSyncScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JoulesSyncScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly sync: JoulesSyncService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const enabled = this.config.get<string>('JOULES_SYNC_ENABLED') === 'true';
    if (!enabled) return;
    if (!this.sync.configured()) {
      this.logger.warn('JOULES_SYNC_ENABLED gesetzt, aber kein Joules-Zugang konfiguriert — Scheduler bleibt inaktiv.');
      return;
    }
    const intervalMs = Number(this.config.get<string>('JOULES_SYNC_INTERVAL_MS') ?? 3_600_000);
    this.logger.log(`Joules-Sync-Scheduler aktiv, Intervall ${intervalMs} ms.`);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    // Node: don't keep the event loop alive solely for the sync timer.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.sync.runSync({ akteur: 'system', ausloeser: 'scheduled' });
    } catch (err) {
      this.logger.error(`Geplanter Joules-Sync fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
