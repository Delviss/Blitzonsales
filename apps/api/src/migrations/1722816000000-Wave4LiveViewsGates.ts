import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wave 4 — live views + acceptance gates (I-16 / I-22 / I-26 / I-31 / I-32).
 *
 * Only two issues need new storage; the rest are logic + tests:
 *   • wiedervorlage (I-31/I-32): the lead-time follow-ups scheduled when an
 *     intake is rejected for "Vorlaufzeit zu lang", with the first admissible
 *     intake day (`faellig_am`) on which Founder/Backoffice are emailed.
 *   • email_outbox (I-32): every dispatched notification, persisted so the mail
 *     is verifiable/auditable (the default sender records here instead of an MTA).
 *
 * I-16 (forecast) is read-only, I-22 is tests, and I-26 reuses the existing
 * storno-account posting object, so none of them add columns.
 *
 * All statements are `IF (NOT) EXISTS` so the migration is idempotent.
 */
export class Wave4LiveViewsGates1722816000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS wiedervorlage (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid REFERENCES contract(id),
        swa_order_number text,
        kunde text,
        vorvertrag_ende date,
        liefer_start date,
        abgelehnt_am date,
        faellig_am date NOT NULL,
        grund text NOT NULL,
        status text NOT NULL DEFAULT 'offen',
        email_gesendet_am timestamptz,
        erstellt_von text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wiedervorlage_faellig ON wiedervorlage (status, faellig_am);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_wiedervorlage_order ON wiedervorlage (swa_order_number);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS email_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empfaenger text NOT NULL,
        betreff text NOT NULL,
        koerper text NOT NULL,
        anlass text,
        referenz_id text,
        transport text NOT NULL DEFAULT 'log',
        gesendet_am timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_email_outbox_anlass ON email_outbox (anlass, gesendet_am DESC);`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS email_outbox;`);
    await queryRunner.query(`DROP TABLE IF EXISTS wiedervorlage;`);
  }
}
