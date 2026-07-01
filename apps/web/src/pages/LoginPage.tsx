import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setupTwoFa, activateTwoFa, verifyTwoFaLogin } from '../lib/auth';

type Step = 'credentials' | 'setup_2fa' | 'verify_2fa';

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const outcome = await login(email, password);
      if (outcome.status === 'ok') {
        onLogin();
        navigate('/dashboard');
      } else if (outcome.status === 'setup_required') {
        const { secret: s, otpauthUrl: url } = await setupTwoFa();
        setSecret(s);
        setOtpauthUrl(url);
        setStep('setup_2fa');
      } else {
        setStep('verify_2fa');
      }
    } catch {
      setError('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
    } finally {
      setLoading(false);
    }
  }

  async function handleActivate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await activateTwoFa(code);
      onLogin();
      navigate('/dashboard');
    } catch {
      setError('Ungültiger Code. Bitte erneut versuchen.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await verifyTwoFaLogin(code);
      onLogin();
      navigate('/dashboard');
    } catch {
      setError('Ungültiger Code. Bitte erneut versuchen.');
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
          {step === 'credentials' && (
            <>
              <h1 className="text-2xl font-extrabold mb-1">Anmelden</h1>
              <p className="text-steel2 text-sm mb-6">Zugang zu BlitzON Control</p>
              <form onSubmit={handleCredentials} className="space-y-4">
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
            </>
          )}

          {step === 'setup_2fa' && (
            <>
              <h1 className="text-2xl font-extrabold mb-1">Zwei-Faktor-Einrichtung</h1>
              <p className="text-steel2 text-sm mb-4">
                Für deine Rolle ist 2FA verpflichtend. Trage diesen Schlüssel in deine Authenticator-App ein
                (z. B. Google Authenticator, Authy):
              </p>
              <div className="bg-navy border border-line rounded-lg px-3 py-2.5 text-sm font-mono text-lime2 mb-1 break-all">
                {secret}
              </div>
              <p className="text-steel text-[11px] mb-4 break-all">{otpauthUrl}</p>
              <form onSubmit={handleActivate} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">6-stelliger Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                    maxLength={6}
                    className="w-full bg-navy border border-line rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime transition-colors tracking-widest"
                  />
                </div>
                {error && <p className="text-red text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-lime text-navy font-bold py-2.5 rounded-lg hover:bg-lime2 transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? 'Wird bestätigt…' : 'Aktivieren & anmelden'}
                </button>
              </form>
            </>
          )}

          {step === 'verify_2fa' && (
            <>
              <h1 className="text-2xl font-extrabold mb-1">Zwei-Faktor-Code</h1>
              <p className="text-steel2 text-sm mb-6">Gib den Code aus deiner Authenticator-App ein.</p>
              <form onSubmit={handleVerify} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-steel uppercase tracking-wide mb-1">6-stelliger Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                    maxLength={6}
                    autoFocus
                    className="w-full bg-navy border border-line rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-lime transition-colors tracking-widest"
                  />
                </div>
                {error && <p className="text-red text-sm">{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-lime text-navy font-bold py-2.5 rounded-lg hover:bg-lime2 transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? 'Wird geprüft…' : 'Bestätigen'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
