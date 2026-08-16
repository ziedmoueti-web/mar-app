import { useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client';
import type { AdminStats } from '@shared/types';
import { ErrorState } from '../../components/ui';

const STATUS_COLORS: Record<string, string> = {
  pending: 'var(--ochre)',
  accepted: 'var(--blue)',
  meetup: 'var(--violet)',
  completed: 'var(--teal)',
  declined: 'var(--text-mute)',
  cancelled: 'var(--text-mute)',
  disputed: 'var(--rust)',
};

export function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api.get<AdminStats>('/api/admin/stats').then(setStats).catch((e) => setError(apiErrorMessage(e)));
  };
  useEffect(load, []);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!stats) return <div className="stat-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 90 }} />)}</div>;

  const maxStatus = Math.max(1, ...Object.values(stats.trades_by_status));
  const maxDay = Math.max(1, ...stats.events_last_14d.map((d) => d.count));
  const maxCat = Math.max(1, ...stats.items_by_category.map((c) => c.count));

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Dashboard</h1>
      <p className="page-sub">Marketplace overview.</p>

      <div className="stat-grid mt-2">
        {[
          { num: stats.users, label: 'Users' },
          { num: stats.items, label: 'Listings' },
          { num: stats.active_trades, label: 'Active trades' },
          { num: stats.completed_trades, label: 'Completed trades' },
          { num: stats.pending_offers, label: 'Pending offers' },
          { num: stats.open_reports, label: 'Open reports' },
          { num: stats.verified_users, label: 'Verified users' },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-card__num">{s.num}</div>
            <div className="stat-card__label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="row mt-3" style={{ alignItems: 'stretch', gap: 14, flexWrap: 'wrap' }}>
        <div className="card grow" style={{ minWidth: 280 }}>
          <div className="small bold mb-2">Trades by status</div>
          {Object.entries(stats.trades_by_status).length === 0 && <p className="tiny muted">No trades yet.</p>}
          {Object.entries(stats.trades_by_status).map(([k, v]) => (
            <div key={k} className="rating-bar-row" style={{ gridTemplateColumns: '90px 1fr 36px' }}>
              <span>{k}</span>
              <div className="rating-bar"><div style={{ width: `${(v / maxStatus) * 100}%`, background: STATUS_COLORS[k] ?? 'var(--ochre)' }} /></div>
              <span>{v}</span>
            </div>
          ))}
        </div>

        <div className="card grow" style={{ minWidth: 280 }}>
          <div className="small bold mb-2">Events — last 14 days</div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 3, height: 110 }}>
            {stats.events_last_14d.map((d) => (
              <div key={d.day} className="grow" title={`${d.day}: ${d.count}`}>
                <div style={{ height: `${Math.max(3, (d.count / maxDay) * 90)}px`, background: 'var(--ochre)', borderRadius: '3px 3px 0 0', opacity: d.count ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
          <div className="tiny muted mt-1">{stats.events_last_14d[0]?.day} → {stats.events_last_14d[13]?.day}</div>
        </div>

        <div className="card grow" style={{ minWidth: 280 }}>
          <div className="small bold mb-2">Listings by category</div>
          {stats.items_by_category.map((c) => (
            <div key={c.category.id} className="rating-bar-row" style={{ gridTemplateColumns: '130px 1fr 36px' }}>
              <span>{c.category.icon} {c.category.name}</span>
              <div className="rating-bar"><div style={{ width: `${(c.count / maxCat) * 100}%` }} /></div>
              <span>{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-3">
        <div className="small bold mb-2">Memberships</div>
        <div className="row wrap">
          {(['free', 'verified', 'premium'] as const).map((m) => (
            <span key={m} className={`badge ${m === 'premium' ? 'badge--violet' : m === 'verified' ? 'badge--teal' : 'badge--mute'}`}>
              {m}: {stats.memberships[m]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
