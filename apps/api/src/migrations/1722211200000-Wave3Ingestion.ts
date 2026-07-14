import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wave 3 data ingestion (Epic P2, I-08…I-12).
 *
 *   • ingestion_archive (I-10): the immutable raw copy + metadata of every API
 *     fetch and every file import.
 *   • ingestion_error (I-11): the data-quality error list.
 *   • sync_run (I-09): a record of each Joules/SWA delta sync.
 *   • contract.ingest_quelle / datenqualitaet_gesperrt (I-11): where a contract
 *     was last ingested from, and whether it is gated from automatic booking.
 *
 * All statements are `IF (NOT) EXISTS` so the migration is idempotent.
 */
export class Wave3Ingestion1722211200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ingestion_archive (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        quelle text NOT NULL,
        referenz text,
        akteur text,
        satz_anzahl int NOT NULL DEFAULT 0,
        fehler_anzahl int NOT NULL DEFAULT 0,
        content_type text,
        sha256 text,
        rohdaten text,
        meta jsonb,
        zeitpunkt timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ingestion_archive_quelle ON ingestion_archive (quelle);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ingestion_archive_zeitpunkt ON ingestion_archive (zeitpunkt DESC);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ingestion_error (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        quelle text NOT NULL,
        archive_id uuid REFERENCES ingestion_archive(id),
        swa_order_number text,
        joules_id text,
        rep_name text,
        org_name text,
        kategorie text NOT NULL,
        feld text,
        grund text NOT NULL,
        rohzeile jsonb,
        behoben boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ingestion_error_offen ON ingestion_error (behoben);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ingestion_error_order ON ingestion_error (swa_order_number);`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sync_run (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        typ text NOT NULL DEFAULT 'joules',
        status text NOT NULL,
        ausloeser text,
        status_filter jsonb,
        verarbeitet int NOT NULL DEFAULT 0,
        erstellt int NOT NULL DEFAULT 0,
        aktualisiert int NOT NULL DEFAULT 0,
        fehler int NOT NULL DEFAULT 0,
        meldung text,
        akteur text,
        beendet_am timestamptz,
        gestartet_am timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sync_run_typ ON sync_run (typ, gestartet_am DESC);`);

    await queryRunner.query(`ALTER TABLE contract ADD COLUMN IF NOT EXISTS ingest_quelle text;`);
    await queryRunner.query(
      `ALTER TABLE contract ADD COLUMN IF NOT EXISTS datenqualitaet_gesperrt boolean NOT NULL DEFAULT false;`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_contract_gesperrt ON contract (datenqualitaet_gesperrt);`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contract DROP COLUMN IF EXISTS datenqualitaet_gesperrt;`);
    await queryRunner.query(`ALTER TABLE contract DROP COLUMN IF EXISTS ingest_quelle;`);
    await queryRunner.query(`DROP TABLE IF EXISTS sync_run;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ingestion_error;`);
    await queryRunner.query(`DROP TABLE IF EXISTS ingestion_archive;`);
  }
}
