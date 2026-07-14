import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WiedervorlageService } from './wiedervorlage.service';

/**
 * Opt-in daily processor that dispatches due Wiedervorlage emails (I-32). It
 * arms only when `WIEDERVORLAGE_SCHEDULER_ENABLED=true`, so CI/dev never spins a
 * background loop; the on-demand endpoint
 * (`POST /api/wiedervorlagen/prozess-faellige`) works regardless. Re-entrancy is
 * guarded so a slow run never overlaps the next tick.
 */
@Injectable()
export class WiedervorlageScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WiedervorlageScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly svc: WiedervorlageService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('WIEDERVORLAGE_SCHEDULER_ENABLED') !== 'true') return;
    const intervalMs = Number(this.config.get<string>('WIEDERVORLAGE_INTERVAL_MS') ?? 86_400_000);
    this.logger.log(`Wiedervorlage-Scheduler aktiv, Intervall ${intervalMs} ms.`);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const asOf = new Date().toISOString().slice(0, 10);
      const { gesendet } = await this.svc.processDue(asOf, 'system');
      if (gesendet > 0) this.logger.log(`${gesendet} Wiedervorlage-Benachrichtigung(en) versandt.`);
    } catch (err) {
      this.logger.error(`Wiedervorlage-Verarbeitung fehlgeschlagen: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
