import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://blitz:blitzdev@localhost:5432/blitzonsales',
  entities: [],
  migrations: [__dirname + '/[0-9]*.ts'],
  synchronize: false,
});

async function run() {
  await ds.initialize();
  const applied = await ds.runMigrations();
  console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.map(m => m.name).join(', ')}` : 'No pending migrations.');
  await ds.destroy();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
