import 'reflect-metadata';
import { DataSource } from 'typeorm';
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

/**
 * Generates several months of realistic-volume contract data across all seeded
 * reps, for load testing (see scripts/load-test.js and docs/runbook.md). Run
 * `npm run seed` first so orgs/reps/produkte/users exist, then this script.
 */
const MONTHS = 6;
const CONTRACTS_PER_REP_PER_MONTH = 40;

const STATUS_WEIGHTS: [string, number][] = [
  ['In Belieferung', 0.35],
  ['Liefertermin steht fest', 0.2],
  ['Im Wechsel', 0.1],
  ['Exportiert', 0.1],
  ['Datencheck', 0.05],
  ['Widerruf', 0.08],
  ['Storno', 0.05],
  ['Abgelehnt', 0.05],
  ['Kreditcheck nicht bestanden', 0.02],
];

function pickStatus(): string {
  const r = Math.random();
  let acc = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    acc += weight;
    if (r <= acc) return status;
  }
  return 'In Belieferung';
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const ds = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://blitz:blitzdev@localhost:5432/blitzonsales',
  entities: [Organisation, SalesRep, Produkt, AppUser, Contract, AuditLog, ImportBatch, CommissionRule, CommissionRun, CommissionLine],
  synchronize: false,
});

async function seedLoad() {
  await ds.initialize();
  const repRepo = ds.getRepository(SalesRep);
  const produktRepo = ds.getRepository(Produkt);
  const contractRepo = ds.getRepository(Contract);

  const reps = await repRepo.find();
  const produkte = await produktRepo.find();
  if (reps.length === 0 || produkte.length === 0) {
    throw new Error('Run `npm run seed` first — no reps/produkte found.');
  }

  let joulesCounter = 900000;
  const batchSize = 500;
  let batch: Contract[] = [];
  let total = 0;

  for (let month = 0; month < MONTHS; month++) {
    for (const rep of reps) {
      for (let i = 0; i < CONTRACTS_PER_REP_PER_MONTH; i++) {
        const daysAgo = month * 30 + Math.floor(Math.random() * 28);
        const produkt = produkte[Math.floor(Math.random() * produkte.length)];
        const status = pickStatus();
        const contract = contractRepo.create({
          joulesId: `LOAD${joulesCounter++}`,
          repId: rep.id,
          produktId: produkt.id,
          organisationId: rep.organisationId,
          kunde: `Lasttest Kunde ${joulesCounter}`,
          plz: '86150',
          ort: 'Augsburg',
          verbrauch: 1500 + Math.floor(Math.random() * 4000),
          erfassungsdatum: isoDaysAgo(daysAgo),
          lieferbeginn: ['Widerruf', 'Storno', 'Abgelehnt', 'Kreditcheck nicht bestanden'].includes(status)
            ? null
            : isoDaysAgo(Math.max(daysAgo - 14, 0)),
          status,
        });
        batch.push(contract);
        if (batch.length >= batchSize) {
          await contractRepo.save(batch);
          total += batch.length;
          batch = [];
        }
      }
    }
  }
  if (batch.length > 0) {
    await contractRepo.save(batch);
    total += batch.length;
  }

  console.log(`Load seed complete: ${total} contracts across ${reps.length} reps over ${MONTHS} months.`);
  await ds.destroy();
}

seedLoad().catch(e => {
  console.error(e);
  process.exit(1);
});
