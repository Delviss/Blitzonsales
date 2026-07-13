import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wave 2 posting objects (I-24 commercial reserve, I-25 clawback receivable).
 *
 * These turn the engine's computed reserve / clawback figures into persisted,
 * lifecycle-bearing posting objects (funded → released; offset → collections)
 * rather than bare append-only ledger lines, so the dashboard can show every
 * ch. 10.1–10.3 field and the remaining receivable is always reconstructable.
 *
 * All statements are `IF (NOT) EXISTS` so the migration is idempotent.
 */
export class PostingObjects1721606400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS commercial_reserve (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid REFERENCES contract(id),
        rep_id uuid REFERENCES sales_rep(id),
        run_id uuid REFERENCES commission_run(id),
        periode text,
        swa_revenue numeric(12,2) NOT NULL DEFAULT 0,
        profit_before_reserve numeric(12,2) NOT NULL DEFAULT 0,
        reserve_target numeric(12,2) NOT NULL DEFAULT 0,
        reserve_actual numeric(12,2) NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'gebucht',
        freigegeben_am timestamptz,
        freigegeben_von text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_commercial_reserve_run ON commercial_reserve (run_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_commercial_reserve_contract ON commercial_reserve (contract_id);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS clawback_receivable (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid REFERENCES contract(id),
        swa_order_number text,
        rep_id uuid REFERENCES sales_rep(id),
        grund text,
        swa_clawback numeric(12,2) NOT NULL DEFAULT 0,
        causer_share numeric(6,4) NOT NULL DEFAULT 1,
        pass_through numeric(12,2) NOT NULL DEFAULT 0,
        offsets jsonb,
        remaining numeric(12,2) NOT NULL DEFAULT 0,
        rechnung_ref text,
        zahlung numeric(12,2) NOT NULL DEFAULT 0,
        inkasso_status text NOT NULL DEFAULT 'offen',
        erstellt_von text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_clawback_receivable_rep ON clawback_receivable (rep_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_clawback_receivable_contract ON clawback_receivable (contract_id);`);

    // I-23 storno account breakdown columns (ch. 10.1): cumulative running totals.
    await queryRunner.query(`
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS storno_privat_einbehalt numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS storno_gewerbe_einbehalt numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS storno_clawback_genutzt numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS storno_freigegeben numeric(12,2) NOT NULL DEFAULT 0;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS storno_freigegeben;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS storno_clawback_genutzt;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS storno_gewerbe_einbehalt;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS storno_privat_einbehalt;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS clawback_receivable;`);
    await queryRunner.query(`DROP TABLE IF EXISTS commercial_reserve;`);
  }
}
