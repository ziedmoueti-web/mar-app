import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import type { Notification } from '@shared/types';
import { EmptyState, ErrorState, timeAgo } from '../components/ui';
import { Icon } from '../components/Icon';

const TYPE_ICON: Record<string, string> = {
  offer_received: '📥',
  offer_accepted: '✅',
  offer_declined: '❌',
  offer_cancelled: '🕊️',
  new_message: '💬',
  meetup_proposed: '📍',
  meetup_confirmed: '🤝',
  trade_completed: '🎉',
  exchange_confirm: '🔁',
  rating_request: '⭐',
  favorite_updated: '🔔',
  similar_item: '✨',
  system: '🛡️',
};

export function NotificationsPage() {
  const [notifs, setNotifs] = useState<Notification[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api.get<{ notifications: Notification[] }>('/api/notifications?limit=100')
      .then(async (r) => {
        setNotifs(r.notifications);
        await api.post('/api/notifications/read').catch(() => {});
      })
      .catch((e) => setError(apiErrorMessage(e)));
  };

  useEffect(load, []);

  const openTrade = (n: Notification) => {
    const tradeId = (n.data as { trade_id?: string } | null)?.trade_id;
    if (tradeId) return `/trades/${tradeId}`;
    const itemId = (n.data as { item_id?: string } | null)?.item_id;
    if (itemId) return `/items/${itemId}`;
    return null;
  };

  return (
    <div className="page" style={{ maxWidth: 620 }}>
      <h1 className="page-title">Notifications</h1>
      <p className="page-sub">Offers, messages and trade updates.</p>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !notifs ? (
        <div className="stack mt-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 60 }} />)}</div>
      ) : notifs.length === 0 ? (
        <EmptyState icon="🔔" title="All quiet" body="You will see offers, messages and trade updates here." />
      ) : (
        <div className="card mt-2" style={{ padding: '6px 16px' }}>
          {notifs.map((n) => {
            const to = openTrade(n);
            const body = (
              <div className={`list-row ${n.read ? '' : ''}`}>
                {!n.read && <span className="notif-dot" />}
                <span style={{ fontSize: 20 }}>{TYPE_ICON[n.type] ?? '🔔'}</span>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="small bold">{n.title}</div>
                  <div className="tiny dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</div>
                </div>
                <span className="tiny muted">{timeAgo(n.created_at)}</span>
              </div>
            );
            return to ? (
              <Link key={n.id} to={to} className="row" style={{ textDecoration: 'none' }}>{body}</Link>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </div>
      )}
      <div className="row mt-3" style={{ justifyContent: 'center', gap: 16 }}>
        <Link to="/favorites" className="small bold" style={{ color: 'var(--ochre)' }}><Icon.heart size={13} /> Saved items</Link>
        <Link to="/trades" className="small bold" style={{ color: 'var(--ochre)' }}><Icon.swap size={13} /> Trades</Link>
      </div>
    </div>
  );
}
