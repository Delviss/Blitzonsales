export interface AuthUser {
  sub: string;
  email: string;
  rolle: string;
  organisationId: string | null;
  repId: string | null;
}

export type LoginOutcome =
  | { status: 'ok' }
  | { status: 'setup_required' }
  | { status: 'verify_required' };

let token: string | null = null;
let pendingToken: string | null = null;
let currentUser: AuthUser | null = null;

export function getToken() { return token; }
export function getUser() { return currentUser; }

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export async function login(email: string, password: string): Promise<LoginOutcome> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Ungültige Anmeldedaten.');
  const data = await res.json();
  if (data.status === 'ok') {
    token = data.accessToken;
    await loadCurrentUser();
    return { status: 'ok' };
  }
  pendingToken = data.tempToken;
  return { status: data.status };
}

/** Requests a fresh TOTP secret for the pending (or already logged-in) user to set up 2FA. */
export async function setupTwoFa(): Promise<{ secret: string; otpauthUrl: string }> {
  const res = await fetch(`${API_BASE}/api/auth/2fa/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken ?? token}` },
  });
  if (!res.ok) throw new Error('2FA-Einrichtung fehlgeschlagen.');
  return res.json();
}

/** Confirms the first TOTP code for a brand-new 2FA setup and completes login. */
export async function activateTwoFa(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/2fa/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken ?? token}` },
    body: JSON.stringify({ token: code }),
  });
  if (!res.ok) throw new Error('Ungültiger Code.');
  const data = await res.json();
  if (data.accessToken) {
    token = data.accessToken;
    pendingToken = null;
    await loadCurrentUser();
  }
}

/** Confirms a TOTP code for a user who already has 2FA enabled, completing login. */
export async function verifyTwoFaLogin(code: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/2fa/verify-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${pendingToken}` },
    body: JSON.stringify({ token: code }),
  });
  if (!res.ok) throw new Error('Ungültiger Code.');
  const { accessToken } = await res.json();
  token = accessToken;
  pendingToken = null;
  await loadCurrentUser();
}

async function loadCurrentUser(): Promise<void> {
  const meRes = await apiFetch('/api/auth/me');
  currentUser = await meRes.json();
}

export function logout() { token = null; pendingToken = null; currentUser = null; }

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export function apiUpload(url: string, formData: FormData): Promise<Response> {
  return fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: formData,
  });
}

export async function apiDownload(url: string, filenameFallback: string): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Download fehlgeschlagen.');
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition');
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? filenameFallback;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE');
}
