import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { Field } from '../components/ui';

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify';

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setSession } = useAuth();
  const { toast } = useToast();
  const from = (location.state as { from?: string })?.from ?? '/';

  const [mode, setMode] = useState<Mode>('login');
  const [form, setForm] = useState({ username: '', display_name: '', email: '', password: '', code: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  const afterAuth = (data: { user: import('@shared/types').PublicUser; onboarded: boolean }) => {
    setSession(data.user, data.onboarded);
    if (!data.onboarded) navigate('/onboarding', { replace: true });
    else navigate(from, { replace: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setInfo(null);
    try {
      if (mode === 'login') {
        const data = await api.post<{ user: import('@shared/types').PublicUser; onboarded: boolean }>('/api/auth/login', {
          email: form.email, password: form.password,
        });
        afterAuth(data);
      } else if (mode === 'signup') {
        const data = await api.post<{ user: import('@shared/types').PublicUser; onboarded: boolean; demo_email_code: string }>('/api/auth/signup', {
          username: form.username, display_name: form.display_name, email: form.email, password: form.password,
        });
        setDemoCode(data.demo_email_code);
        setMode('verify');
        setInfo('We sent a 6-digit code to your email. (Demo mode: the code is shown below.)');
        toast('Account created — verify your email to continue.', 'success');
      } else if (mode === 'forgot') {
        const data = await api.post<{ ok: boolean }>('/api/auth/reset/request', { email: form.email });
        void data;
        setMode('reset');
        setInfo('If that email exists, a reset code was sent. Check the server log (demo mode).');
      } else if (mode === 'reset') {
        await api.post('/api/auth/reset/confirm', {
          email: form.email, code: form.code, password: form.confirm,
        });
        toast('Password updated — you are signed in.', 'success');
        navigate('/', { replace: true });
      } else if (mode === 'verify') {
        const data = await api.post<{ user: import('@shared/types').PublicUser; onboarded: boolean }>('/api/auth/verify', { code: form.code });
        afterAuth(data);
        toast('Email verified ✓', 'success');
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast(apiErrorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  const fillDemo = (role: 'user' | 'admin') => {
    setForm((f) => ({
      ...f,
      email: role === 'admin' ? 'admin@badel.tn' : 'demo@badel.tn',
      password: role === 'admin' ? 'badel-admin' : 'badel-demo',
    }));
  };

  const modeTitle: Record<Mode, string> = {
    login: 'Welcome back',
    signup: 'Join Badel',
    verify: 'Verify your email',
    forgot: 'Reset your password',
    reset: 'Set a new password',
  };

  return (
    <div className="page" style={{ maxWidth: 460, paddingTop: 48 }}>
      <div className="center mb-2">
        <div className="brand" style={{ justifyContent: 'center' }}>
          <span className="brand-word" style={{ fontSize: 34 }}>BADEL</span>
        </div>
        <p className="kicker" style={{ marginTop: 6 }}>Trade, not money</p>
      </div>

      <h1 className="serif center" style={{ fontSize: 26, marginTop: 18 }}>{modeTitle[mode]}</h1>
      <p className="center muted small mt-1 mb-2">
        {mode === 'login' && 'Sign in to browse, list and trade.'}
        {mode === 'signup' && 'Free forever to explore. No payment required.'}
        {mode === 'verify' && 'Enter the 6-digit code we sent you.'}
        {mode === 'forgot' && 'We will send a reset code to your email.'}
        {mode === 'reset' && 'Choose a new password (at least 8 characters).'}
      </p>

      {info && (
        <div className="card mb-2" style={{ background: 'var(--teal-soft)', borderColor: 'rgba(47,181,154,0.4)', fontSize: 13 }}>
          {info}
        </div>
      )}
      {demoCode && (
        <div className="card mb-2" style={{ textAlign: 'center' }}>
          <div className="tiny muted">Demo email — your verification code is</div>
          <div className="serif" style={{ fontSize: 30, letterSpacing: 6, color: 'var(--ochre)', margin: '6px 0' }}>
            {demoCode}
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => setForm((f) => ({ ...f, code: demoCode }))}>
            Use this code
          </button>
        </div>
      )}

      <form onSubmit={submit} className="card">
        {mode === 'signup' && (
          <>
            <Field label="Name" error={errors.display_name}>
              <input className="input" value={form.display_name} onChange={set('display_name')} placeholder="Ahmed Ben Salah" autoComplete="name" />
            </Field>
            <Field label="Username" error={errors.username} hint="Letters, numbers, _ and . (3–24 chars)">
              <input className="input" value={form.username} onChange={set('username')} placeholder="ahmed" autoComplete="username" />
            </Field>
          </>
        )}
        <Field label="Email" error={errors.email}>
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
        </Field>
        {mode !== 'forgot' && mode !== 'reset' && (
          <Field label="Password" error={errors.password}>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
        )}
        {(mode === 'verify' || mode === 'reset') && (
          <Field label="6-digit code" error={errors.code}>
            <input className="input" value={form.code} onChange={set('code')} placeholder="000000" inputMode="numeric" maxLength={6} />
          </Field>
        )}
        {mode === 'reset' && (
          <Field label="New password" error={errors.confirm}>
            <input className="input" type="password" value={form.confirm} onChange={set('confirm')} placeholder="At least 8 characters" autoComplete="new-password" />
          </Field>
        )}

        <button className="btn btn--primary btn--block btn--lg" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create my account' : mode === 'verify' ? 'Verify email' : mode === 'forgot' ? 'Send reset code' : 'Set new password'}
        </button>
      </form>

      <div className="center small mt-2">
        {mode === 'login' ? (
          <>
            <span className="muted">New to Badel?</span>{' '}
            <button className="bold" style={{ color: 'var(--ochre)' }} onClick={() => { setMode('signup'); setErrors({}); }}>Create an account</button>
            <div className="mt-1">
              <button className="muted" style={{ textDecoration: 'underline' }} onClick={() => setMode('forgot')}>Forgot password?</button>
            </div>
          </>
        ) : mode !== 'verify' && mode !== 'reset' ? (
          <>
            <span className="muted">Already have an account?</span>{' '}
            <button className="bold" style={{ color: 'var(--ochre)' }} onClick={() => { setMode('login'); setErrors({}); }}>Sign in</button>
          </>
        ) : (
          <button className="muted" style={{ textDecoration: 'underline' }} onClick={() => { setMode('login'); setErrors({}); }}>Back to sign in</button>
        )}
      </div>

      <div className="card mt-3" style={{ borderStyle: 'dashed' }}>
        <div className="tiny muted mb-1">Demo environment — try it instantly:</div>
        <div className="row wrap">
          <button className="btn btn--soft btn--sm" onClick={() => fillDemo('user')}>Explore as Demo User</button>
          <button className="btn btn--soft btn--sm" onClick={() => fillDemo('admin')}>Explore as Admin</button>
        </div>
        <div className="tiny muted mt-1">
          demo@badel.tn / badel-demo · admin@badel.tn / badel-admin
        </div>
      </div>
    </div>
  );
}
