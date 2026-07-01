export interface AuthUser {
  sub: string;
  email: string;
  rolle: string;
}

let token: string | null = null;
let currentUser: AuthUser | null = null;

export function getToken() { return token; }
export function getUser() { return currentUser; }

export async function login(email: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('Ungültige Anmeldedaten.');
  const { accessToken } = await res.json();
  token = accessToken;
  const meRes = await apiFetch('/api/auth/me');
  currentUser = await meRes.json();
}

export function logout() { token = null; currentUser = null; }

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
}

export function formatEur(amount: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-DE');
}
