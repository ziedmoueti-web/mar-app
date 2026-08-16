import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import type { OfferWithDetails } from '@shared/types';
import { EmptyState, ErrorState, SkeletonCard, StatusPill, timeAgo } from '../components/ui';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ui';

type Scope = 'incoming' | 'sent' | 'active' | 'completed' | 'problem';

const TABS: { v: Scope; label: string }[] = [
  { v: 'incoming', label: 'Incoming' },
  { v: 'sent', label: 'Sent' },
  { v: 'active', label: 'Active' },
  { v: 'completed', label: 'Completed' },
  { v: 'problem', label: 'Problem' },
];

export function TradesPage() {
  const [scope, setScope] = useState<Scope>('incoming');
  const [offers, setOffers] = useState<OfferWithDetails[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setOffers(null);
    api.get<{ offers: OfferWithDetails[] }>(`/api/offers?scope=${scope}`)
      .then((r) => setOffers(r.offers))
      .catch((e) => setError(apiErrorMessage(e)));
  }, [scope]);

  useEffect(load, [load]);

  const countFor = (s: Scope) => (offers ? offers.filter((o) => o.status === 'pending').length : 0);

  return (
    <div className="page">
      <h1 className="page-title">Trades</h1>
      <p className="page-sub">Offers, exchanges and history.</p>

      <div className="tab-bar mt-2">
        {TABS.map((t) => (
          <button key={t.v} className={`tab-item ${scope === t.v ? 'tab-item--active' : ''}`} onClick={() => setScope(t.v)}>
            {t.label}
            {t.v === 'incoming' && countFor('incoming') > 0 && <span className="tab-count">{countFor('incoming')}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !offers ? (
        <div className="stack">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : offers.length === 0 ? (
        <EmptyState
          icon={scope === 'incoming' ? '📥' : scope === 'sent' ? '📤' : scope === 'completed' ? '✅' : '🕊️'}
          title={
            scope === 'incoming' ? 'No offers received'
              : scope === 'sent' ? 'No offers sent'
                : scope === 'active' ? 'No active trades'
                  : scope === 'completed' ? 'No completed trades yet'
                    : 'Nothing to resolve'
          }
          body={
            scope === 'incoming'
              ? 'When someone offers a trade for your item, it appears here.'
              : scope === 'sent'
                ? 'Open a listing and press “Offer a trade”.'
                : scope === 'active'
                  ? 'Accepted trades you are arranging appear here.'
                  : 'Your history will appear here.'
          }
          action={scope === 'sent' ? <Link to="/" className="btn btn--primary btn--sm">Browse items</Link> : undefined}
        />
      ) : (
        <div className="trades-list">
          {offers.map((o) => {
            const mine = o.from_user_id === o.counterpart.id ? false : true; // counterpart is the other party
            void mine;
            const other = o.counterpart;
            const thumb = o.requested_item?.photos[0]?.storage_path ?? o.offered_item?.photos[0]?.storage_path;
            return (
              <Link key={o.id} to={`/trades/${o.id}`} className="trade-card" style={{ alignItems: 'stretch' }}>
                {thumb ? (
                  <img src={thumb} alt="" className="trade-card__thumb" />
                ) : (
                  <div className="trade-card__thumb" style={{ display: 'grid', placeItems: 'center' }}>📦</div>
                )}
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 6 }}>
                    <Avatar user={other} size={20} />
                    <span className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{other.display_name}</span>
                    <span className="tiny muted">{timeAgo(o.created_at)}</span>
                  </div>
                  <div className="small dim mt-1" style={{ lineHeight: 1.4 }}>
                    <b style={{ color: 'var(--text)' }}>{o.offered_item?.title ?? 'Item'}</b>
                    <span style={{ color: 'var(--ochre)' }}> ↔ </span>
                    <b style={{ color: 'var(--text)' }}>{o.requested_item?.title ?? 'Item'}</b>
                  </div>
                  {o.unread_message_count > 0 && (
                    <div className="row mt-1" style={{ gap: 5 }}>
                      <Icon.message size={13} style={{ color: 'var(--ochre)' }} />
                      <span className="tiny bold" style={{ color: 'var(--ochre)' }}>{o.unread_message_count} new</span>
                    </div>
                  )}
                </div>
                <div className="row" style={{ alignItems: 'center' }}>
                  <StatusPill status={o.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
