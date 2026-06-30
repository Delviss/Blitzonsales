import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://blitz:blitzdev@localhost:5432/blitzonsales',
  entities: [__dirname + '/entities/*.entity{.ts,.js}'],
  synchronize: false,
});

async function seed() {
  await AppDataSource.initialize();
  const q = AppDataSource.createQueryRunner();

  const orgResult = await q.query(`
    INSERT INTO organisation (name, parent_id, typ)
    VALUES
      ('BlitzON OHG', NULL, 'gf'),
      ('Spear Vertrieb', (SELECT id FROM organisation WHERE name='BlitzON OHG'), 'team'),
      ('Highlevel UG', (SELECT id FROM organisation WHERE name='BlitzON OHG'), 'team'),
      ('Team Augsburg', (SELECT id FROM organisation WHERE name='BlitzON OHG'), 'team')
    ON CONFLICT DO NOTHING
    RETURNING id, name;
  `);
  console.log('Orgs:', orgResult.length, 'rows');

  const passwordHash = await bcrypt.hash('BlitzDev2026!', 12);
  await q.query(`
    INSERT INTO app_user (email, password, rolle, organisation_id)
    VALUES ($1, $2, 'admin_gf', (SELECT id FROM organisation WHERE name='BlitzON OHG'))
    ON CONFLICT (email) DO NOTHING;
  `, ['admin@blitzon.de', passwordHash]);
  console.log('Admin user ensured');

  const repNames = [
    'Sean Tyler Kreuzer',
    'Nevian Gerle',
    'Leon Harelimana',
    'Daniel May',
    'Tobias Berger',
    'Markus Schneider',
    'Julia Hoffmann',
    'Andreas Müller',
    'Stefan Koch',
    'Lena Fischer',
    'Patrick Wagner',
    'Sandra Bauer',
  ];

  const orgIds: { name: string; id: string }[] = await q.query(
    `SELECT id, name FROM organisation WHERE name IN ('Spear Vertrieb','Highlevel UG','Team Augsburg')`,
  );
  const orgMap: Record<string, string> = {};
  for (const r of orgIds) orgMap[r.name] = r.id;

  const orgList = ['Spear Vertrieb', 'Highlevel UG', 'Team Augsburg'];
  for (let i = 0; i < repNames.length; i++) {
    const orgName = orgList[i % 3];
    await q.query(
      `INSERT INTO sales_rep (name, organisation_id, aktiv)
       VALUES ($1, $2, true)
       ON CONFLICT DO NOTHING;`,
      [repNames[i], orgMap[orgName]],
    );
  }
  console.log('Sales reps seeded');

  const products = [
    { name: 'swa Gas Fest6 DV', energie: 'Gas', bestand: false },
    { name: 'swa Strom Fest24 DV', energie: 'Strom', bestand: false },
    { name: 'swa Strom Augsburg DV', energie: 'Strom', bestand: false },
    { name: 'swa Strom Fest24 natur DV', energie: 'Strom', bestand: false },
  ];
  for (const p of products) {
    await q.query(
      `INSERT INTO produkt (name, energie, bestand) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING;`,
      [p.name, p.energie, p.bestand],
    );
  }
  console.log('Products seeded');

  const adminUser = await q.query(`SELECT id FROM app_user WHERE email='admin@blitzon.de' LIMIT 1`);
  const adminId = adminUser[0]?.id;
  const batchResult = await q.query(
    `INSERT INTO import_batch (datei, zeilen, importiert_von) VALUES ('seed.xlsx', 10, $1) RETURNING id;`,
    [adminId],
  );
  const batchId = batchResult[0].id;

  const repRows = await q.query(`SELECT id, name FROM sales_rep LIMIT 12`);
  const prodRows = await q.query(`SELECT id, name FROM produkt`);
  const orgRow = await q.query(`SELECT id FROM organisation WHERE name='BlitzON OHG' LIMIT 1`);

  const statuses = [
    'In Belieferung',
    'Liefertermin steht fest',
    'Im Wechsel',
    'Datencheck',
    'Exportiert',
    'Abgelehnt',
    'Widerruf',
    'Storno',
    'Kreditcheck nicht bestanden',
    'Manueller Kreditcheck',
  ];

  for (let i = 0; i < 10; i++) {
    const rep = repRows[i % repRows.length];
    const prod = prodRows[i % prodRows.length];
    const status = statuses[i];
    await q.query(
      `INSERT INTO contract (joules_id, rep_id, produkt_id, organisation_id, kunde, plz, ort, str_hsnr, verbrauch, erfassungsdatum, lieferbeginn, status, import_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (joules_id) DO NOTHING;`,
      [
        `SEED-${1000 + i}`,
        rep.id,
        prod.id,
        orgRow[0].id,
        `Musterkunde ${i + 1}`,
        `8600${i}`,
        'Augsburg',
        `Musterstraße ${i + 1}`,
        1500 + i * 100,
        '2026-01-15',
        '2026-02-01',
        status,
        batchId,
      ],
    );
  }
  console.log('Sample contracts seeded');

  await q.release();
  await AppDataSource.destroy();
  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
