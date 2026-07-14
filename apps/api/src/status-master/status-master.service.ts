import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { STATUS_MASTER_DEFAULTS, StatusMasterEntry } from '@blitzon/shared';
import { StatusMaster } from '../entities/status-master.entity';

/**
 * Status master data (I-06, Fachkonzept ch. 5.1 / 4.1). Single source of truth
 * for which contract statuses qualify. The tier / compensation engines resolve
 * the qualifying set from here as-of a reference date; the safety rule is that a
 * status not explicitly released as qualifying never counts.
 */
@Injectable()
export class StatusMasterService {
  constructor(
    @InjectRepository(StatusMaster)
    private readonly repo: Repository<StatusMaster>,
  ) {}

  /**
   * Resolve the master as-of a reference date: for each `code`, the row with the
   * latest `gueltig_ab` that is not after `asOf`. Codes whose earliest release
   * is still in the future are omitted (not yet released).
   */
  async resolveAsOf(asOf: string): Promise<StatusMaster[]> {
    const rows = await this.repo.find();
    const byCode = new Map<string, StatusMaster>();
    for (const row of rows) {
      if (row.gueltigAb > asOf) continue;
      const current = byCode.get(row.code);
      if (!current || row.gueltigAb > current.gueltigAb) byCode.set(row.code, row);
    }
    return [...byCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  }

  /**
   * The set of qualifying status codes as-of a date (I-06 safety rule). Only
   * statuses explicitly released with `qualifiziert = true` are returned; any
   * status absent from the master, or released as non-qualifying, is excluded.
   */
  async qualifyingCodes(asOf: string): Promise<string[]> {
    const resolved = await this.resolveAsOf(asOf);
    return resolved.filter((s) => s.qualifiziert).map((s) => s.code);
  }

  /** Whether a single status code qualifies as-of a date (defaults to false). */
  async isQualifying(code: string, asOf: string): Promise<boolean> {
    const codes = await this.qualifyingCodes(asOf);
    return codes.includes(code);
  }

  /**
   * Every status code released (in any state) as-of a date — the set of *known*
   * statuses. Used by the ingestion data-quality check (I-11) to flag a status
   * that is absent from the master as invalid.
   */
  async knownCodes(asOf: string): Promise<string[]> {
    const resolved = await this.resolveAsOf(asOf);
    return resolved.map((s) => s.code);
  }

  /** All rows (every version), newest valid-from first, for the admin surface. */
  async findAll(): Promise<StatusMaster[]> {
    return this.repo.find({ order: { code: 'ASC', gueltigAb: 'DESC' } });
  }

  /** Append a new versioned status-master entry (never mutates prior rows). */
  async setEntry(
    entry: { code: string; bezeichnung: string; qualifiziert: boolean; kategorie?: string | null; gueltigAb: string; quelle?: string | null },
    erstelltVon?: string,
  ): Promise<StatusMaster> {
    const row = this.repo.create({
      code: entry.code,
      bezeichnung: entry.bezeichnung,
      qualifiziert: entry.qualifiziert,
      kategorie: entry.kategorie ?? null,
      gueltigAb: entry.gueltigAb,
      quelle: entry.quelle ?? null,
      erstelltVon: erstelltVon ?? null,
    });
    return this.repo.save(row);
  }

  /**
   * Seed the initial release of the default status master (stand-in for Joules
   * `OPTIONS /clients/statuses`). Idempotent: only inserts codes that have no
   * version yet.
   */
  async seedDefaults(gueltigAb = '2026-01-01'): Promise<number> {
    let inserted = 0;
    for (const def of STATUS_MASTER_DEFAULTS as StatusMasterEntry[]) {
      const existing = await this.repo.count({ where: { code: def.code } });
      if (existing > 0) continue;
      await this.setEntry(
        { code: def.code, bezeichnung: def.bezeichnung, qualifiziert: def.qualifiziert, kategorie: def.kategorie, gueltigAb, quelle: 'seed' },
      );
      inserted += 1;
    }
    return inserted;
  }
}
