import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persisted Fachkonzept Provisionslauf (Phase 1 remainder — wiring the pure
 * calculation core into runs).
 *
 *  - `commission_run.verfahren` distinguishes a Fachkonzept run from the legacy
 *    rule-engine run so both can coexist on the same tables.
 *  - `commission_run.fachkonzept_zusammenfassung` (jsonb) persists the computed
 *    per-rep salary/storno summary + reserves + totals so the detail view and
 *    the freigabe balance postings do not have to recompute.
 *
 * All changes are `IF (NOT) EXISTS` so the migration is idempotent.
 */
export class FachkonzeptRun1721001600000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_run ADD COLUMN IF NOT EXISTS verfahren text NOT NULL DEFAULT 'legacy';
      ALTER TABLE commission_run ADD COLUMN IF NOT EXISTS fachkonzept_zusammenfassung jsonb;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_run DROP COLUMN IF EXISTS fachkonzept_zusammenfassung;
      ALTER TABLE commission_run DROP COLUMN IF EXISTS verfahren;
    `);
  }
}
