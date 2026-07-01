import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../lib/auth';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      onLogin();
      navigate('/dashboard');
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span style={{
            width: 16, height: 16, background: '#8BC53F', display: 'inline-block',
            clipPath: 'polygon(45% 0,100% 0,55% 45%,100% 45%,0 100%,40% 55%,0 55%)'
          }} />
          <span className="font-extrabold text-lg tracking-wide">BlitzON<small className="font-medium text-steel text-[11px] tracking-[2px] ml-1">CONTROL</small></span>
        </div>

        <div className="bg-panel border border-line rounded-2xl p-8">
          <h1 className="text-2xl font-extrabold mb-1">Anmelden</h1>
          <p className="text-steel2 text-sm mb-6">Zugang zu BlitzON Control</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">E-Mail</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full bg-navy border border-line rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime transition-colors"
                placeholder="admin@blitzon.de"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">Passwort</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-navy border border-line rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime transition-colors"
              />
            </div>

            {error && <p className="text-red text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-lime text-navy font-bold py-2.5 rounded-lg hover:bg-lime2 transition-colors disabled:opacity-50 mt-2"
            >
              {loading ? 'Wird angemeldet…' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
