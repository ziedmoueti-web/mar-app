import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PublicUser } from '@shared/types';
import { Icon } from './Icon';

// ---- Avatar ---------------------------------------------------

export function Avatar({ user, size = 40, ring = false }: { user?: Pick<PublicUser, 'display_name' | 'avatar_url'> | null; size?: number; ring?: boolean }) {
  const name = user?.display_name ?? '?';
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={name}
        className={`avatar ${ring ? 'avatar--ring' : ''}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      />
    );
  }
  return (
    <div className={`avatar ${ring ? 'avatar--ring' : ''}`} style={{ width: size, height: size, fontSize: size * 0.38 }} aria-label={name}>
      {initials}
    </div>
  );
}

// ---- Rating ----------------------------------------------------

export function Stars({ value, size = 14 }: { value: number | null; size?: number }) {
  if (value == null) {
    return <span className="small muted">No ratings yet</span>;
  }
  return (
    <span className="stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon.star key={i} size={size} filled={i <= Math.round(value)} />
      ))}
      <span className="rating-num" style={{ fontSize: size - 1 }}>{value.toFixed(1)}</span>
    </span>
  );
}

export function VerifiedBadge({ small = false }: { small?: boolean }) {
  return (
    <span className={`verified-dot ${small ? 'tiny' : ''}`} title="Verified account">
      <Icon.check size={small ? 9 : 11} strokeWidth={3} />
    </span>
  );
}

// ---- Status pill ----------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  pending: 'Offer sent',
  accepted: 'Accepted',
  meetup: 'Arranging exchange',
  completed: 'Completed',
  declined: 'Declined',
  cancelled: 'Cancelled',
  disputed: 'Disputed',
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill status-${status}`}>
      <span className="status-dot" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function ConditionLabel({ condition }: { condition: string }) {
  const map: Record<string, string> = {
    new: 'New', like_new: 'Like new', good: 'Good', fair: 'Fair', poor: 'Poor',
  };
  return <span>{map[condition] ?? condition}</span>;
}

// ---- Empty / loading -------------------------------------------

export function EmptyState({ icon = '📦', title, body, action }: { icon?: string; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {body && <p className="small" style={{ maxWidth: 320 }}>{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function Spinner({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="Loading">
      <circle cx="12" cy="12" r="9" stroke="var(--surface-3)" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--ochre)" strokeWidth="2.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="center mt-3" style={{ padding: '40px 0' }}>
      <Spinner size={34} />
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-state">
      <div style={{ fontSize: 34 }}>⚠️</div>
      <p className="mt-1">{message}</p>
      {onRetry && (
        <button className="btn btn--ghost btn--sm mt-2" onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="item-card">
      <div className="skeleton" style={{ aspectRatio: '4/3' }} />
      <div className="item-card__body">
        <div className="skeleton" style={{ height: 14, width: '90%' }} />
        <div className="skeleton" style={{ height: 12, width: '60%' }} />
      </div>
    </div>
  );
}

// ---- Modal -----------------------------------------------------

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between mb-2">
          <h3 className="section-title">{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon.x size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="row mt-2" style={{ justifyContent: 'flex-end', gap: 8 }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = 'Confirm', danger = false, busy = false }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string; body: string; confirmLabel?: string; danger?: boolean; busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="dim">{body}</p>
      <div className="row mt-2" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn--ghost btn--sm" onClick={onClose} disabled={busy}>Keep</button>
        <button
          className={`btn btn--sm ${danger ? 'btn--danger' : 'btn--primary'}`}
          disabled={busy}
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// ---- Form field -------------------------------------------------

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

// ---- Countdown / time helpers ----------------------------------

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
