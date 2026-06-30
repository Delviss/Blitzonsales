import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1719792000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organisation (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        parent_id uuid REFERENCES organisation(id),
        typ text
      );

      CREATE TABLE IF NOT EXISTS sales_rep (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        organisation_id uuid REFERENCES organisation(id),
        iban text,
        aktiv boolean DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS produkt (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        energie text NOT NULL,
        bestand boolean DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS app_user (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password text NOT NULL,
        rolle text NOT NULL,
        organisation_id uuid REFERENCES organisation(id),
        twofa_secret text,
        twofa_enabled boolean DEFAULT false
      );

      CREATE TABLE IF NOT EXISTS import_batch (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        datei text,
        zeilen integer,
        importiert_von uuid REFERENCES app_user(id),
        zeitpunkt timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS contract (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        joules_id text UNIQUE NOT NULL,
        rep_id uuid REFERENCES sales_rep(id),
        produkt_id uuid REFERENCES produkt(id),
        organisation_id uuid REFERENCES organisation(id),
        kunde text,
        plz text,
        ort text,
        str_hsnr text,
        verbrauch integer,
        erfassungsdatum date,
        lieferbeginn date,
        status text NOT NULL,
        import_batch_id uuid REFERENCES import_batch(id)
      );

      CREATE TABLE IF NOT EXISTS commission_rule (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        typ text NOT NULL,
        bedingung jsonb NOT NULL,
        satz numeric(10,2),
        gueltig_ab date NOT NULL,
        organisation_id uuid REFERENCES organisation(id)
      );

      CREATE TABLE IF NOT EXISTS commission_run (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        periode text NOT NULL,
        organisation_id uuid REFERENCES organisation(id),
        status text DEFAULT 'entwurf',
        freigegeben_von uuid REFERENCES app_user(id),
        freigegeben_am timestamptz
      );

      CREATE TABLE IF NOT EXISTS commission_line (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id uuid REFERENCES commission_run(id),
        contract_id uuid REFERENCES contract(id),
        rep_id uuid REFERENCES sales_rep(id),
        regel_id uuid REFERENCES commission_rule(id),
        betrag numeric(10,2) NOT NULL,
        typ text DEFAULT 'normal',
        storniert_durch uuid REFERENCES commission_line(id),
        begruendung text
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        entity text,
        entity_id uuid,
        aktion text,
        alt jsonb,
        neu jsonb,
        user_id uuid REFERENCES app_user(id),
        zeitpunkt timestamptz DEFAULT now()
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS audit_log;
      DROP TABLE IF EXISTS commission_line;
      DROP TABLE IF EXISTS commission_run;
      DROP TABLE IF EXISTS commission_rule;
      DROP TABLE IF EXISTS contract;
      DROP TABLE IF EXISTS import_batch;
      DROP TABLE IF EXISTS app_user;
      DROP TABLE IF EXISTS produkt;
      DROP TABLE IF EXISTS sales_rep;
      DROP TABLE IF EXISTS organisation;
    `);
  }
}
