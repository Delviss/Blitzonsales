import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wave 5 — Governance (I-34 / I-35 / I-36).
 *
 * Two issues need new storage; the rest are logic + tests reusing existing
 * tables:
 *   • month_close (I-34): the explicit month-end close/freeze, its frozen figure
 *     snapshot and the set of booked contract ids (so a later, newly-
 *     commissionable contract can be told apart from one already booked and be
 *     picked up as an addendum without reopening the closed month).
 *   • manual_override (I-36): the append-only override audit trail (actor /
 *     timestamp / old / new / original SWA / reason / document).
 *
 * I-35 (warning & check system) is read-only over existing data, so it adds no
 * columns. `manueller_override` on `contract` already exists (Phase 1). All
 * statements are `IF (NOT) EXISTS` so the migration is idempotent.
 */
export class Wave5Governance1723420800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS month_close (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        periode text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'geschlossen',
        snapshot jsonb,
        gebuchte_vertrag_ids jsonb,
        geschlossen_am timestamptz,
        geschlossen_von text,
        wieder_geoeffnet_am timestamptz,
        wieder_geoeffnet_von text,
        reopen_grund text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_month_close_status ON month_close (status);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS manual_override (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity text NOT NULL,
        entity_id text NOT NULL,
        contract_id uuid REFERENCES contract(id),
        feld text NOT NULL,
        alt_wert numeric(12,2),
        neu_wert numeric(12,2),
        original_swa numeric(12,2),
        grund text NOT NULL,
        dokument text,
        akteur text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_manual_override_contract ON manual_override (contract_id, created_at DESC);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS manual_override;`);
    await queryRunner.query(`DROP TABLE IF EXISTS month_close;`);
  }
}
