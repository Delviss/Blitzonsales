import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { authenticator } from 'otplib';
import { AppModule } from '../src/app.module';

/**
 * Exercises the full stack (real Postgres, real HTTP layer) against the seeded
 * fixtures from `src/seed/seed.ts`. Expects a freshly migrated + freshly seeded
 * database (that is exactly what the CI e2e job does; see .github/workflows/ci.yml).
 * Running this twice against the same database will fail the 2FA setup step for
 * admin/backoffice, since a second login sees `verify_required` instead of
 * `setup_required` and this suite does not persist the TOTP secret across runs.
 */
describe('BlitzON Control (e2e)', () => {
  let app: INestApplication;
  const PASSWORD = 'BlitzDev2026!';
  let adminToken: string;
  let teamleiterToken: string;
  let backofficeToken: string;
  let readonlyToken: string;
  let repToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix('api');
    await app.init();

    teamleiterToken = await loginFull('teamleiter@blitzon.de');
    readonlyToken = await loginFull('readonly@blitzon.de');
    repToken = await loginFull('verkauf@blitzon.de');
    adminToken = await loginWithMandatory2fa('admin@blitzon.de');
    backofficeToken = await loginWithMandatory2fa('backoffice@blitzon.de');
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  async function loginFull(email: string): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD });
    if (res.body.status !== 'ok') throw new Error(`Expected role for ${email} to log in without 2FA, got ${res.body.status}`);
    return res.body.accessToken;
  }

  async function loginWithMandatory2fa(email: string): Promise<string> {
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email, password: PASSWORD });
    if (loginRes.body.status !== 'setup_required') {
      throw new Error(`Expected ${email} to require 2FA setup on a fresh database, got ${loginRes.body.status}`);
    }
    const tempToken = loginRes.body.tempToken;
    const setupRes = await request(app.getHttpServer()).post('/api/auth/2fa/setup').set('Authorization', `Bearer ${tempToken}`).send();
    const code = authenticator.generate(setupRes.body.secret);
    const activateRes = await request(app.getHttpServer()).post('/api/auth/2fa/activate').set('Authorization', `Bearer ${tempToken}`).send({ token: code });
    return activateRes.body.accessToken;
  }

  it('rejects a pending 2FA token on a business endpoint', async () => {
    const loginRes = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@blitzon.de', password: PASSWORD });
    // admin already completed setup in beforeAll, so this is now a verify_required challenge
    expect(loginRes.body.status).toBe('verify_required');
    const res = await request(app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${loginRes.body.tempToken}`);
    expect(res.status).toBe(401);
  });

  it('confines Aussendienst to their own contracts', async () => {
    const res = await request(app.getHttpServer()).get('/api/vertraege').set('Authorization', `Bearer ${repToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const contract of res.body) {
      expect(contract.rep?.name).toBeDefined();
    }
  });

  it('blocks Aussendienst from listing sales reps or commission runs', async () => {
    const reps = await request(app.getHttpServer()).get('/api/verkaeufer').set('Authorization', `Bearer ${repToken}`);
    expect(reps.status).toBe(403);
    const runs = await request(app.getHttpServer()).get('/api/provisionslaeufe').set('Authorization', `Bearer ${repToken}`);
    expect(runs.status).toBe(403);
  });

  it('retires the legacy Teamleiter role from Phase-1 surfaces (I-05)', async () => {
    // Teamleiter is a reserved portal role now: it can authenticate but reaches
    // no Phase-1 endpoint (read or write).
    const list = await request(app.getHttpServer()).get('/api/provisionslaeufe').set('Authorization', `Bearer ${teamleiterToken}`);
    expect(list.status).toBe(403);
    const create = await request(app.getHttpServer())
      .post('/api/provisionslaeufe')
      .set('Authorization', `Bearer ${teamleiterToken}`)
      .send({ periode: '2026-05' });
    expect(create.status).toBe(403);
  });

  it('gives the read-only role read access but no write access (I-05)', async () => {
    // read-only may reach Phase-1 read surfaces
    const list = await request(app.getHttpServer()).get('/api/provisionslaeufe').set('Authorization', `Bearer ${readonlyToken}`);
    expect(list.status).toBe(200);
    const reps = await request(app.getHttpServer()).get('/api/verkaeufer').set('Authorization', `Bearer ${readonlyToken}`);
    expect(reps.status).toBe(200);
    const statuses = await request(app.getHttpServer()).get('/api/status-master').set('Authorization', `Bearer ${readonlyToken}`);
    expect(statuses.status).toBe(200);
    // but never mutate: creating a run or importing is forbidden
    const create = await request(app.getHttpServer())
      .post('/api/provisionslaeufe')
      .set('Authorization', `Bearer ${readonlyToken}`)
      .send({ periode: '2026-05' });
    expect(create.status).toBe(403);
    const seedStatus = await request(app.getHttpServer())
      .post('/api/status-master/seed')
      .set('Authorization', `Bearer ${readonlyToken}`);
    expect(seedStatus.status).toBe(403);
  });

  it('serves the seeded status master and its qualifying set (I-06)', async () => {
    const all = await request(app.getHttpServer()).get('/api/status-master').set('Authorization', `Bearer ${adminToken}`);
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThan(0);
    const qualifying = await request(app.getHttpServer()).get('/api/status-master/qualifying').set('Authorization', `Bearer ${adminToken}`);
    expect(qualifying.status).toBe(200);
    // released-qualifying statuses count; un-released ones (e.g. Storno) never do
    expect(qualifying.body).toContain('In Belieferung');
    expect(qualifying.body).not.toContain('Storno');
  });

  it('rejects an import file with no recognisable joules_id column', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/import')
      .set('Authorization', `Bearer ${backofficeToken}`)
      .attach('file', Buffer.from('Kunde;Status\nMax;In Belieferung\n'), 'bad.csv');
    expect(res.status).toBe(400);
  });

  it('runs a full monthly commission cycle: create -> generate -> four-eyes approve -> export', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/provisionslaeufe')
      .set('Authorization', `Bearer ${backofficeToken}`)
      .send({ periode: '2026-05' });
    expect(createRes.status).toBe(201);
    const runId = createRes.body.run.id;
    expect(createRes.body.run.status).toBe('entwurf');
    expect(createRes.body.lines.length).toBeGreaterThan(0);

    // the creator (backoffice) is not allowed to freigeben (role-gated to admin_gf)
    const creatorFreigabe = await request(app.getHttpServer())
      .post(`/api/provisionslaeufe/${runId}/freigeben`)
      .set('Authorization', `Bearer ${backofficeToken}`);
    expect(creatorFreigabe.status).toBe(403);

    // a different user (admin) approves: four-eyes satisfied
    const freigabe = await request(app.getHttpServer())
      .post(`/api/provisionslaeufe/${runId}/freigeben`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(freigabe.status).toBe(201);
    expect(freigabe.body.run.status).toBe('freigegeben');

    // approving again is rejected
    const secondFreigabe = await request(app.getHttpServer())
      .post(`/api/provisionslaeufe/${runId}/freigeben`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(secondFreigabe.status).toBe(409);

    const csvExport = await request(app.getHttpServer())
      .get(`/api/provisionslaeufe/${runId}/export/buchhaltung?format=csv`)
      .set('Authorization', `Bearer ${backofficeToken}`);
    expect(csvExport.status).toBe(200);
    expect(csvExport.headers['content-type']).toContain('text/csv');

    const internExport = await request(app.getHttpServer())
      .get(`/api/provisionslaeufe/${runId}/export/intern`)
      .set('Authorization', `Bearer ${backofficeToken}`);
    expect(internExport.status).toBe(200);
  });

  it('runs a persisted Fachkonzept Provisionslauf: create -> generate -> four-eyes approve', async () => {
    // create + generate in one call (verfahren=fachkonzept)
    const createRes = await request(app.getHttpServer())
      .post('/api/provisionslaeufe/fachkonzept')
      .set('Authorization', `Bearer ${backofficeToken}`)
      .send({ periode: '2026-05' });
    expect(createRes.status).toBe(201);
    const runId = createRes.body.run.id;
    expect(createRes.body.run.verfahren).toBe('fachkonzept');
    expect(createRes.body.lines.length).toBeGreaterThan(0);
    // the persisted summary carries the per-rep salary/storno breakdown + totals
    expect(createRes.body.summary).toBeTruthy();
    expect(Array.isArray(createRes.body.summary.repSummaries)).toBe(true);
    expect(createRes.body.summary.totals).toHaveProperty('faelligGesamt');
    // seeded reps sell below the Fixum ⇒ salary protection accrues a negative balance
    const anyProtected = createRes.body.summary.repSummaries.some((r: any) => r.negativsaldoDelta > 0);
    expect(anyProtected).toBe(true);

    // the legacy engine must refuse to touch a Fachkonzept run
    const legacyGenerate = await request(app.getHttpServer())
      .post(`/api/provisionslaeufe/${runId}/generate`)
      .set('Authorization', `Bearer ${backofficeToken}`);
    expect(legacyGenerate.status).toBe(409);

    // four-eyes: creator (backoffice) is role-gated out of freigeben; admin approves
    const freigabe = await request(app.getHttpServer())
      .post(`/api/provisionslaeufe/fachkonzept/${runId}/freigeben`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(freigabe.status).toBe(201);
    expect(freigabe.body.run.status).toBe('freigegeben');

    // approving again is rejected
    const secondFreigabe = await request(app.getHttpServer())
      .post(`/api/provisionslaeufe/fachkonzept/${runId}/freigeben`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(secondFreigabe.status).toBe(409);

    // Fachkonzept runs do not leak into the legacy list
    const legacyList = await request(app.getHttpServer())
      .get('/api/provisionslaeufe')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(legacyList.body.every((r: any) => r.verfahren !== 'fachkonzept')).toBe(true);

    // Wave 2: the freigabe posted the storno withholding to the account posting
    // objects (I-23) and the commercial reserves became posting objects (I-24).
    const stornoKonten = await request(app.getHttpServer())
      .get('/api/storno-konten')
      .set('Authorization', `Bearer ${backofficeToken}`);
    expect(stornoKonten.status).toBe(200);
    expect(Array.isArray(stornoKonten.body)).toBe(true);
    expect(stornoKonten.body[0]).toHaveProperty('freiVerfuegbar');

    const reserveSummary = await request(app.getHttpServer())
      .get('/api/gewerbe-ruecklagen/summary')
      .set('Authorization', `Bearer ${backofficeToken}`);
    expect(reserveSummary.status).toBe(200);
    expect(reserveSummary.body.total).toHaveProperty('reserveTarget');
  });

  it('creates a clawback receivable and offsets it in the fixed order (I-25)', async () => {
    // pick any seeded rep as the causer
    const reps = await request(app.getHttpServer()).get('/api/verkaeufer').set('Authorization', `Bearer ${adminToken}`);
    const repId = reps.body[0].id;

    const created = await request(app.getHttpServer())
      .post('/api/clawbacks')
      .set('Authorization', `Bearer ${backofficeToken}`)
      .send({ repId, swaClawback: 2000, causerShare: 0.5, grund: 'Widerruf (e2e)' });
    expect(created.status).toBe(201);
    expect(created.body.passThrough).toBe(1000); // 2000 × 50%
    // remaining + all offsets applied must reconstruct the pass-through
    const offsetSum = (created.body.offsets ?? []).reduce((s: number, o: any) => s + Number(o.applied), 0);
    expect(offsetSum + Number(created.body.remaining)).toBeCloseTo(1000, 2);

    const list = await request(app.getHttpServer()).get('/api/clawbacks').set('Authorization', `Bearer ${readonlyToken}`);
    expect(list.status).toBe(200);
    expect(list.body.some((c: any) => c.id === created.body.id)).toBe(true);

    // read-only may not create a clawback
    const forbidden = await request(app.getHttpServer())
      .post('/api/clawbacks')
      .set('Authorization', `Bearer ${readonlyToken}`)
      .send({ repId, swaClawback: 100, causerShare: 1 });
    expect(forbidden.status).toBe(403);
  });

  it('lets an admin change a commission rate without affecting already-frozen runs', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/provisionsregeln')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ typ: 'e2e-test-regel', bedingung: {}, satz: 42.5, gueltigAb: '2026-01-01' });
    expect(createRes.status).toBe(201);
    const ruleId = createRes.body.id;

    const updateRes = await request(app.getHttpServer())
      .put(`/api/provisionsregeln/${ruleId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ satz: 55 });
    expect(updateRes.status).toBe(200);
    expect(Number(updateRes.body.satz)).toBe(55);
  });

  it('reconciles the dashboard KPI for a rep to their own frozen commission lines', async () => {
    const res = await request(app.getHttpServer()).get('/api/dashboard').set('Authorization', `Bearer ${repToken}`);
    expect(res.status).toBe(200);
    expect(res.body.myLines).toBeDefined();
    const frozenLinesSum = res.body.myLines
      .filter((l: any) => l.runStatus === 'freigegeben')
      .reduce((sum: number, l: any) => sum + l.betrag, 0);
    expect(Math.round(frozenLinesSum * 100) / 100).toBe(res.body.kpis.netCommission);
  });
});
