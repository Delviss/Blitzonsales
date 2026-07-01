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
  const res = await fetch(`${API_BASE}/api/auth/login`, {
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

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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
