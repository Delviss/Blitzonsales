import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Status master data (I-06, Fachkonzept ch. 5.1 / 4.1).
 *
 * Valid-from versioned like the business config: one row per (code, gueltig_ab)
 * release; the tier engines resolve the qualifying set as-of a reference date.
 * The safety rule (any status not explicitly released as qualifying never
 * counts) is enforced in StatusMasterService, not by a DB constraint.
 *
 * Idempotent via IF NOT EXISTS.
 */
export class StatusMaster1721260800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS status_master (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL,
        bezeichnung text NOT NULL,
        qualifiziert boolean NOT NULL DEFAULT false,
        kategorie text,
        gueltig_ab date NOT NULL,
        quelle text,
        erstellt_von text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_status_master_code_gueltig_ab
        ON status_master (code, gueltig_ab);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS status_master;`);
  }
}
