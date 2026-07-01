import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase4Phase5Schema1720051200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app_user ADD COLUMN IF NOT EXISTS rep_id uuid REFERENCES sales_rep(id);
      ALTER TABLE commission_run ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES app_user(id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE commission_run DROP COLUMN IF EXISTS created_by;
      ALTER TABLE app_user DROP COLUMN IF EXISTS rep_id;
    `);
  }
}
