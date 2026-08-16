import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import type { MembershipResult } from '@shared/types';
import { Icon } from '../components/Icon';

export function VerifyPage() {
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<'verified' | 'premium'>('verified');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MembershipResult['membership'] | null>(null);

  if (!user) return null;
  if (user.membership_status !== 'free') {
    return (
      <div className="page" style={{ maxWidth: 520 }}>
        <div className="empty-state">
          <div style={{ fontSize: 44 }}>🛡️</div>
          <h1 className="serif" style={{ fontSize: 26 }}>You are already a member</h1>
          <p className="small dim">
            Status: <b style={{ color: 'var(--teal)' }}>{user.membership_status}</b>. Thank you for supporting the marketplace!
          </p>
          <button className="btn btn--primary" onClick={() => navigate('/')}>Back to Browse</button>
        </div>
      </div>
    );
  }

  const purchase = async () => {
    setBusy(true);
    try {
      const r = await api.post<MembershipResult>('/api/membership/purchase', { plan });
      setResult(r.membership);
      await refresh();
      toast('Welcome to Badel Verified! 🛡️', 'success');
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ maxWidth: 520 }}>
      <h1 className="page-title">Verify your account</h1>
      <p className="page-sub">Optional, one-time, and never required to trade.</p>

      <div className="card mt-2" style={{ borderColor: 'rgba(47,181,154,0.35)', background: 'rgba(47,181,154,0.06)' }}>
        <div className="row" style={{ gap: 8 }}>
          <Icon.check size={16} style={{ color: 'var(--teal)' }} />
          <span className="small dim">
            You are already trading for free — browse, list, offer and swap. Verification simply adds a trust badge.
          </span>
        </div>
      </div>

      <div className="stack mt-3">
        {([
          { v: 'verified', title: 'Verified', price: '$5', once: 'one-time', perks: ['✓ Verified badge on your profile', '✓ Higher visibility in search', '✓ Extra trust when trading'] },
          { v: 'premium', title: 'Premium', price: '$5', once: 'one-time', perks: ['✓ Everything in Verified', '✓ Priority match placement', '✓ Premium badge (gold)'] },
        ] as const).map((p) => (
          <button
            key={p.v}
            className="card"
            style={{
              textAlign: 'left',
              borderColor: plan === p.v ? 'var(--ochre)' : 'var(--border)',
              background: plan === p.v ? 'var(--ochre-soft)' : 'var(--surface)',
              boxShadow: plan === p.v ? '0 0 0 1px var(--ochre)' : 'none',
            }}
            onClick={() => setPlan(p.v)}
          >
            <div className="row-between">
              <div>
                <div className="bold" style={{ fontSize: 16 }}>{p.title}</div>
                <div className="tiny muted">{p.once} · no subscription</div>
              </div>
              <div className="serif" style={{ fontSize: 26, color: 'var(--ochre)' }}>{p.price}</div>
            </div>
            <div className="small dim mt-1" style={{ whiteSpace: 'pre-line' }}>{p.perks.join('\n')}</div>
          </button>
        ))}
      </div>

      {!result ? (
        <button className="btn btn--primary btn--block btn--lg mt-3" disabled={busy} onClick={purchase}>
          {busy ? 'Processing…' : 'Pay once and verify'}
        </button>
      ) : (
        <div className="card mt-3" style={{ borderColor: 'rgba(47,181,154,0.5)' }}>
          <div className="row" style={{ gap: 8 }}>
            <Icon.check size={18} style={{ color: 'var(--teal)' }} />
            <span className="bold">You are verified 🛡️</span>
          </div>
          <p className="tiny dim mt-1">
            Reference {result.reference} · {result.amount} {result.currency} · {result.method}
          </p>
          <button className="btn btn--primary btn--block mt-2" onClick={() => navigate('/')}>Continue</button>
        </div>
      )}

      <div className="card mt-3" style={{ borderStyle: 'dashed' }}>
        <div className="tiny bold muted mb-1">Demo environment — payment simulation</div>
        <p className="tiny muted">
          Badel does not process real payments in this build. The button above runs a <b>mock payment flow</b>:
          no card is charged and no real money moves. The membership state is recorded locally.
          In production, this is replaced by a real payment provider (Stripe or similar) behind the same interface.
        </p>
      </div>
    </div>
  );
}
