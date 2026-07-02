import { useState, FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, setupTwoFa, activateTwoFa, verifyTwoFaLogin } from '../lib/auth';
import { MailIcon, LockIcon, ShieldIcon, CopyIcon, CheckIcon } from '../components/icons';
import logoFull from '../assets/brand/logo-full-white.png';

type Step = 'credentials' | 'setup_2fa' | 'verify_2fa';

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-steel pointer-events-none">{icon}</span>
        {children}
      </div>
    </div>
  );
}

const inputCls = 'input pl-10';

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
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<void>, fallback: string) {
    setLoading(true);
    setError('');
    try {
      await fn();
    } catch {
      setError(fallback);
    } finally {
      setLoading(false);
    }
  }

  const handleCredentials = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
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
    }, 'Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
  };

  const handleActivate = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await activateTwoFa(code);
      onLogin();
      navigate('/dashboard');
    }, 'Ungültiger Code. Bitte erneut versuchen.');
  };

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await verifyTwoFaLogin(code);
      onLogin();
      navigate('/dashboard');
    }, 'Ungültiger Code. Bitte erneut versuchen.');
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard nicht verfügbar – Secret bleibt sichtbar. */
    }
  };

  const codeInput = (autoFocus: boolean) => (
    <Field label="6-stelliger Code" icon={<ShieldIcon size={15} />}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={e => setCode(e.target.value)}
        required
        maxLength={6}
        autoFocus={autoFocus}
        placeholder="••••••"
        className={`${inputCls} tracking-[0.5em] font-mono text-center text-base`}
      />
    </Field>
  );

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-12 overflow-hidden">
      <div className="ambient" />
      {/* Ambient bolt glow behind the card */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[560px] w-[560px] rounded-full animate-bolt-pulse"
        style={{ background: 'radial-gradient(circle, rgba(8,184,231,0.14) 0%, transparent 62%)' }}
      />

      <div className="w-full max-w-md relative animate-fade-up">
        <div className="flex justify-center mb-9">
          <img
            src={logoFull}
            alt="BlitzON Consulting – Energy. Sales. Performance."
            className="w-[330px] max-w-[80vw] drop-shadow-[0_0_28px_rgba(8,184,231,0.28)]"
          />
        </div>

        <div className="card p-8 backdrop-blur-xl bg-panel/85 shadow-pop">
          {step === 'credentials' && (
            <div key="credentials" className="animate-fade-in">
              <h1 className="text-[22px] font-extrabold tracking-tight text-white mb-1">Willkommen zurück</h1>
              <p className="text-steel2 text-sm mb-7">Melde dich bei BlitzON Control an.</p>
              <form onSubmit={handleCredentials} className="space-y-5">
                <Field label="E-Mail" icon={<MailIcon size={15} />}>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className={inputCls}
                    placeholder="name@blitzon.de"
                  />
                </Field>
                <Field label="Passwort" icon={<LockIcon size={15} />}>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className={inputCls}
                    placeholder="••••••••"
                  />
                </Field>
                {error && <p className="text-red text-sm animate-fade-in">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
                  {loading && <Spinner />}
                  {loading ? 'Wird angemeldet…' : 'Anmelden'}
                </button>
              </form>
            </div>
          )}

          {step === 'setup_2fa' && (
            <div key="setup" className="animate-fade-in">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="h-8 w-8 rounded-xl bg-brand/10 border border-brand/25 text-brand flex items-center justify-center">
                  <ShieldIcon size={15} />
                </span>
                <h1 className="text-[22px] font-extrabold tracking-tight text-white">Zwei-Faktor-Einrichtung</h1>
              </div>
              <p className="text-steel2 text-sm mb-5">
                Für deine Rolle ist 2FA verpflichtend. Trage diesen Schlüssel in deine
                Authenticator-App ein (z. B. Google Authenticator, Authy):
              </p>
              <div className="relative bg-navy border border-line rounded-xl px-3.5 py-3 pr-11 text-[13px] font-mono text-brand-soft mb-2 break-all select-all">
                {secret}
                <button
                  type="button"
                  onClick={copySecret}
                  title="Schlüssel kopieren"
                  className={`absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg flex items-center justify-center transition-colors ${
                    copied ? 'text-green' : 'text-steel hover:text-white'
                  }`}
                >
                  {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                </button>
              </div>
              <p className="text-steel text-[11px] mb-5 break-all">{otpauthUrl}</p>
              <form onSubmit={handleActivate} className="space-y-5">
                {codeInput(true)}
                {error && <p className="text-red text-sm animate-fade-in">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
                  {loading && <Spinner />}
                  {loading ? 'Wird bestätigt…' : 'Aktivieren & anmelden'}
                </button>
              </form>
            </div>
          )}

          {step === 'verify_2fa' && (
            <div key="verify" className="animate-fade-in">
              <div className="flex items-center gap-2.5 mb-1">
                <span className="h-8 w-8 rounded-xl bg-brand/10 border border-brand/25 text-brand flex items-center justify-center">
                  <ShieldIcon size={15} />
                </span>
                <h1 className="text-[22px] font-extrabold tracking-tight text-white">Zwei-Faktor-Code</h1>
              </div>
              <p className="text-steel2 text-sm mb-7">Gib den Code aus deiner Authenticator-App ein.</p>
              <form onSubmit={handleVerify} className="space-y-5">
                {codeInput(true)}
                {error && <p className="text-red text-sm animate-fade-in">{error}</p>}
                <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
                  {loading && <Spinner />}
                  {loading ? 'Wird geprüft…' : 'Bestätigen'}
                </button>
              </form>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-steel mt-6 tracking-[2px] uppercase">
          Vertriebs- &amp; Provisionsplattform
        </p>
      </div>
    </div>
  );
}
