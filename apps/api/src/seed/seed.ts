import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
dotenv.config();

import { Organisation } from '../entities/organisation.entity';
import { SalesRep } from '../entities/sales-rep.entity';
import { Produkt } from '../entities/produkt.entity';
import { AppUser } from '../entities/app-user.entity';
import { Contract } from '../entities/contract.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { ImportBatch } from '../entities/import-batch.entity';
import { CommissionRule } from '../entities/commission-rule.entity';
import { CommissionRun } from '../entities/commission-run.entity';
import { CommissionLine } from '../entities/commission-line.entity';

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://blitz:blitzdev@localhost:5432/blitzonsales',
  entities: [Organisation, SalesRep, Produkt, AppUser, Contract, AuditLog, ImportBatch, CommissionRule, CommissionRun, CommissionLine],
  synchronize: false,
});

async function seed() {
  await ds.initialize();

  // Idempotency guard: the Docker entrypoint runs this on every container
  // start, but the demo data must only be inserted once.
  const existingUsers = await ds.getRepository(AppUser).count();
  if (existingUsers > 0) {
    console.log('Seed skipped: database already contains users.');
    await ds.destroy();
    return;
  }

  const orgRepo = ds.getRepository(Organisation);
  const repRepo = ds.getRepository(SalesRep);
  const produktRepo = ds.getRepository(Produkt);
  const userRepo = ds.getRepository(AppUser);
  const contractRepo = ds.getRepository(Contract);

  // Orgs
  const root = orgRepo.create({ name: 'BlitzON OHG', typ: 'root' });
  await orgRepo.save(root);
  const spear = orgRepo.create({ name: 'Spear Vertrieb', parentId: root.id, typ: 'team' });
  const highlevel = orgRepo.create({ name: 'Highlevel UG', parentId: root.id, typ: 'team' });
  const augsburg = orgRepo.create({ name: 'Team Augsburg', parentId: root.id, typ: 'team' });
  await orgRepo.save([spear, highlevel, augsburg]);

  // Produkte
  const produkte = await produktRepo.save([
    produktRepo.create({ name: 'swa Gas Fest6 DV', energie: 'Gas', bestand: false }),
    produktRepo.create({ name: 'swa Strom Fest24 DV', energie: 'Strom', bestand: false }),
    produktRepo.create({ name: 'swa Strom Augsburg DV', energie: 'Strom', bestand: false }),
    produktRepo.create({ name: 'swa Strom Fest24 natur DV', energie: 'Strom', bestand: false }),
    produktRepo.create({ name: 'swa Strom Bestand', energie: 'Strom', bestand: true }),
  ]);

  // Sales reps
  const repNames = [
    'Sean Tyler Kreuzer', 'Nevian Gerle', 'Leon Harelimana', 'Daniel May',
    'Tobias Rein', 'Maximilian Grunwald', 'Julia Steinberg', 'Anna Fuchs',
    'Kevin Lorenz', 'Philipp Wegner', 'Laura Brandt', 'Sascha Metz',
  ];
  const reps = await repRepo.save(
    repNames.map((name, i) =>
      repRepo.create({ name, organisationId: [spear, highlevel, augsburg][i % 3].id, aktiv: true })
    )
  );

  // Users: one per role, for RBAC testing
  const pw = await bcrypt.hash('BlitzDev2026!', 12);
  await userRepo.save([
    userRepo.create({ email: 'admin@blitzon.de', password: pw, rolle: 'admin_gf', organisationId: root.id }),
    userRepo.create({ email: 'teamleiter@blitzon.de', password: pw, rolle: 'teamleiter', organisationId: spear.id }),
    userRepo.create({ email: 'backoffice@blitzon.de', password: pw, rolle: 'backoffice', organisationId: root.id }),
    userRepo.create({ email: 'verkauf@blitzon.de', password: pw, rolle: 'aussendienst', organisationId: spear.id, repId: reps[0].id }),
  ]);

  // Sample contracts
  const statuses = [
    'Liefertermin steht fest', 'In Belieferung', 'Im Wechsel',
    'Abgelehnt', 'Widerruf', 'Storno', 'Datencheck',
    'Liefertermin steht fest', 'In Belieferung', 'Exportiert',
  ];
  const joulesIds = [
    'SWG0264122', 'SWG0264120', 'SWG0263691', '247203',
    'SWG0263500', 'SWG0264001', 'SWG0264050', '203513',
    'SWG0264200', 'SWG0264300',
  ];
  const contracts = joulesIds.map((joulesId, i) =>
    contractRepo.create({
      joulesId,
      repId: reps[i % reps.length].id,
      produktId: produkte[i % produkte.length].id,
      organisationId: root.id,
      kunde: `Kunde ${i + 1}`,
      plz: '86150',
      ort: 'Augsburg',
      verbrauch: 2500 + i * 100,
      erfassungsdatum: '2026-05-15',
      lieferbeginn: statuses[i].includes('Widerruf') || statuses[i].includes('Abgelehnt') ? null : '2026-07-01',
      status: statuses[i],
    })
  );
  await contractRepo.save(contracts);

  console.log('Seed complete.');
  await ds.destroy();
}

seed().catch(e => { console.error(e); process.exit(1); });
