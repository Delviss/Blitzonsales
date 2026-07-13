import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConfigKey,
  ConfigVersion as ConfigVersionDto,
  FACHKONZEPT_DEFAULTS,
  resolveConfig,
} from '@blitzon/shared';
import { ConfigVersion } from '../entities/config-version.entity';

/**
 * Versioned business-config store (I-01, Fachkonzept ch. 16). Values are never
 * hardcoded in the engines; they are resolved from here as-of a reference date
 * so recomputing a closed month uses the version that was valid then.
 */
@Injectable()
export class BusinessConfigService {
  constructor(
    @InjectRepository(ConfigVersion)
    private readonly repo: Repository<ConfigVersion>,
  ) {}

  /** Resolve a single key as-of a reference date (falls back to the shipped default). */
  async resolve<T = unknown>(key: ConfigKey | string, asOf: string): Promise<T | undefined> {
    const rows = await this.repo.find({ where: { schluessel: key as string } });
    const entries: ConfigVersionDto[] = rows.map((r) => ({
      key: r.schluessel,
      value: r.wert,
      gueltigAb: r.gueltigAb,
    }));
    const resolved = resolveConfig<T>(entries, key as string, asOf);
    if (resolved !== undefined) return resolved;
    return FACHKONZEPT_DEFAULTS[key as ConfigKey] as T | undefined;
  }

  /** Resolve every config key as-of a reference date into a typed map. */
  async resolveAll(asOf: string): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const key of Object.values(ConfigKey)) {
      out[key] = await this.resolve(key, asOf);
    }
    return out;
  }

  /** Create a new version of a key (append-only; never mutates prior rows). */
  async setValue(key: ConfigKey | string, value: unknown, gueltigAb: string, erstelltVon?: string): Promise<ConfigVersion> {
    const row = this.repo.create({ schluessel: key as string, wert: value, gueltigAb, erstelltVon: erstelltVon ?? null });
    return this.repo.save(row);
  }

  /**
   * Seed the initial (valid-from) version of every business value from the
   * Fachkonzept defaults, only for keys that have no version yet. Idempotent.
   */
  async seedDefaults(gueltigAb = '2026-01-01'): Promise<number> {
    let inserted = 0;
    for (const key of Object.values(ConfigKey)) {
      const existing = await this.repo.count({ where: { schluessel: key } });
      if (existing > 0) continue;
      await this.setValue(key, FACHKONZEPT_DEFAULTS[key], gueltigAb);
      inserted += 1;
    }
    return inserted;
  }
}
