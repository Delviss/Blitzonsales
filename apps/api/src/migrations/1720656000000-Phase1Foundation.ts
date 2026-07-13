import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Epic P0 · Phase-1 foundation (issues I-01 … I-04).
 *
 *  - I-01 versioned config store (`config_version`)
 *  - I-02 extended contract data model
 *  - I-03 append-only status & financial event ledger
 *  - I-04 extended rep / organisation master data
 *
 * All column adds are `IF NOT EXISTS` so the migration is idempotent and safe on
 * top of the existing schema.
 */
export class Phase1Foundation1720656000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- I-01 versioned configuration ------------------------------------------
      CREATE TABLE IF NOT EXISTS config_version (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        schluessel text NOT NULL,
        wert jsonb NOT NULL,
        gueltig_ab date NOT NULL,
        erstellt_von uuid REFERENCES app_user(id),
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_config_version_key_date
        ON config_version (schluessel, gueltig_ab);

      -- I-02 contract data model ----------------------------------------------
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS swa_order_number text;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS client_type text;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS start_delivery_type text;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS tariff_energy_type text;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS rate_extra_profit_provision numeric(10,4);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS rate_extra_profit_provision_gp numeric(10,4);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS previous_volume numeric(14,2);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS vorvertrag_ende date;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS vertrag_ende date;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS laufzeit_monate int;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS swa_gesamtprovision numeric(12,2);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS swa_zahlbetrag numeric(12,2);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS kreditcheck_datum date;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS storno_datum date;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS erwartete_swa_provision numeric(12,2);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS tatsaechliche_swa_provision numeric(12,2);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS abweichung numeric(12,2);
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS plausibilitaet_status text;
      ALTER TABLE contract ADD COLUMN IF NOT EXISTS manueller_override numeric(12,2);

      -- I-04 rep master data --------------------------------------------------
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS rolle text;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS grundgehalt numeric(10,2);
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS eintrittsdatum date;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS austrittsdatum date;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS trainer_id uuid REFERENCES sales_rep(id);
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS teamlead_id uuid REFERENCES sales_rep(id);
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS negativsaldo numeric(12,2) NOT NULL DEFAULT 0;
      ALTER TABLE sales_rep ADD COLUMN IF NOT EXISTS storno_konto_saldo numeric(12,2) NOT NULL DEFAULT 0;

      -- I-04 organisation master data -----------------------------------------
      ALTER TABLE organisation ADD COLUMN IF NOT EXISTS org_typ text;
      ALTER TABLE organisation ADD COLUMN IF NOT EXISTS partner_verguetungsmodell text;

      -- I-03 append-only ledgers ----------------------------------------------
      CREATE TABLE IF NOT EXISTS contract_status_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid NOT NULL REFERENCES contract(id),
        swa_order_number text,
        monat text,
        status text NOT NULL,
        quelle text NOT NULL,
        akteur text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_status_event_contract
        ON contract_status_event (contract_id, created_at);

      CREATE TABLE IF NOT EXISTS financial_event (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        contract_id uuid REFERENCES contract(id),
        swa_order_number text,
        monat text,
        typ text NOT NULL,
        betrag numeric(12,2) NOT NULL,
        quelle text NOT NULL,
        akteur text,
        begruendung text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_financial_event_contract
        ON financial_event (contract_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_financial_event_monat
        ON financial_event (monat);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS financial_event;
      DROP TABLE IF EXISTS contract_status_event;

      ALTER TABLE organisation DROP COLUMN IF EXISTS partner_verguetungsmodell;
      ALTER TABLE organisation DROP COLUMN IF EXISTS org_typ;

      ALTER TABLE sales_rep DROP COLUMN IF EXISTS storno_konto_saldo;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS negativsaldo;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS teamlead_id;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS trainer_id;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS austrittsdatum;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS eintrittsdatum;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS grundgehalt;
      ALTER TABLE sales_rep DROP COLUMN IF EXISTS rolle;

      ALTER TABLE contract DROP COLUMN IF EXISTS manueller_override;
      ALTER TABLE contract DROP COLUMN IF EXISTS plausibilitaet_status;
      ALTER TABLE contract DROP COLUMN IF EXISTS abweichung;
      ALTER TABLE contract DROP COLUMN IF EXISTS tatsaechliche_swa_provision;
      ALTER TABLE contract DROP COLUMN IF EXISTS erwartete_swa_provision;
      ALTER TABLE contract DROP COLUMN IF EXISTS storno_datum;
      ALTER TABLE contract DROP COLUMN IF EXISTS kreditcheck_datum;
      ALTER TABLE contract DROP COLUMN IF EXISTS swa_zahlbetrag;
      ALTER TABLE contract DROP COLUMN IF EXISTS swa_gesamtprovision;
      ALTER TABLE contract DROP COLUMN IF EXISTS laufzeit_monate;
      ALTER TABLE contract DROP COLUMN IF EXISTS vertrag_ende;
      ALTER TABLE contract DROP COLUMN IF EXISTS vorvertrag_ende;
      ALTER TABLE contract DROP COLUMN IF EXISTS previous_volume;
      ALTER TABLE contract DROP COLUMN IF EXISTS rate_extra_profit_provision_gp;
      ALTER TABLE contract DROP COLUMN IF EXISTS rate_extra_profit_provision;
      ALTER TABLE contract DROP COLUMN IF EXISTS tariff_energy_type;
      ALTER TABLE contract DROP COLUMN IF EXISTS start_delivery_type;
      ALTER TABLE contract DROP COLUMN IF EXISTS client_type;
      ALTER TABLE contract DROP COLUMN IF EXISTS swa_order_number;

      DROP TABLE IF EXISTS config_version;
    `);
  }
}
