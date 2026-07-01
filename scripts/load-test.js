// k6 load test for BlitzON Control.
//
// Prerequisites: `npm run seed` then `npm run seed:load` in apps/api against the
// target environment (never production!) to get several months of realistic
// contract volume across every seeded rep. See docs/runbook.md for full setup.
//
// Run: k6 run -e BASE_URL=http://localhost:3001 scripts/load-test.js
//
// Scenario: simulates the two heaviest real-world moments: many reps checking
// their dashboard at once (Flow B in docs/workflow.md), and a Teamleiter kicking
// off a monthly commission run (Flow A) while that dashboard traffic continues.

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

export const options = {
  scenarios: {
    rep_dashboards: {
      executor: 'constant-vus',
      vus: 20,
      duration: '2m',
      exec: 'repDashboard',
    },
    monthly_run: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 1,
      exec: 'monthlyRun',
      startTime: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1500'],
    http_req_failed: ['rate<0.01'],
  },
};

function login(email, password) {
  const res = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, { 'login ok': r => r.status === 200 && r.json('status') === 'ok' });
  return res.json('accessToken');
}

export function repDashboard() {
  const token = login('verkauf@blitzon.de', 'BlitzDev2026!');
  const res = http.get(`${BASE_URL}/api/dashboard`, { headers: { Authorization: `Bearer ${token}` } });
  check(res, { 'dashboard 200': r => r.status === 200 });
  sleep(1 + Math.random() * 2);
}

export function monthlyRun() {
  const token = login('teamleiter@blitzon.de', 'BlitzDev2026!');
  const periode = `2026-${String(1 + Math.floor(Math.random() * 12)).padStart(2, '0')}`;
  const res = http.post(`${BASE_URL}/api/provisionslaeufe`, JSON.stringify({ periode }), {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  check(res, { 'run created': r => r.status === 201 });
}
