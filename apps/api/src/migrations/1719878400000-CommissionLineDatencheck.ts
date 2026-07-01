import { MigrationInterface, QueryRunner } from 'typeorm';

export class CommissionLineDatencheck1719878400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_line ADD COLUMN IF NOT EXISTS datencheck boolean NOT NULL DEFAULT false;
      ALTER TABLE commission_rule ADD COLUMN IF NOT EXISTS produkt_id uuid REFERENCES produkt(id);
      ALTER TABLE commission_rule ADD COLUMN IF NOT EXISTS gueltig_bis date;
      ALTER TABLE import_batch ADD COLUMN IF NOT EXISTS fehler jsonb;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE import_batch DROP COLUMN IF EXISTS fehler;
      ALTER TABLE commission_rule DROP COLUMN IF EXISTS gueltig_bis;
      ALTER TABLE commission_rule DROP COLUMN IF EXISTS produkt_id;
      ALTER TABLE commission_line DROP COLUMN IF EXISTS datencheck;
    `);
  }
}
