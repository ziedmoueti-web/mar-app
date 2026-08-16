import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client';
import { ErrorState } from '../../components/ui';

interface AnalyticsData {
  events: { name: string; c: number }[];
  top_items: { item_id: string; c: number }[];
}

const EVENT_LABEL: Record<string, string> = {
  signup: 'Signups',
  login: 'Logins',
  onboarding_complete: 'Onboarding completed',
  listing_created: 'Listings created',
  item_viewed: 'Item views',
  search_performed: 'Searches',
  offer_sent: 'Offers sent',
  offer_accepted: 'Offers accepted',
  meetup_confirmed: 'Meetups confirmed',
  trade_completed: 'Trades completed',
  message_sent: 'Messages sent',
  favorite_added: 'Favorites added',
  user_verified: 'Users verified',
  report_submitted: 'Reports submitted',
  listing_photo_uploaded: 'Photos uploaded',
};

export function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<AnalyticsData>('/api/admin/analytics').then(setData).catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <div className="skeleton" style={{ height: 200 }} />;

  const max = Math.max(1, ...data.events.map((e) => e.c));

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Analytics</h1>
      <p className="page-sub">Product events. No personal data is collected.</p>

      <div className="card mt-2" style={{ maxWidth: 520 }}>
        <div className="small bold mb-2">Events</div>
        {data.events.map((e) => (
          <div key={e.name} className="rating-bar-row" style={{ gridTemplateColumns: '190px 1fr 44px' }}>
            <span>{EVENT_LABEL[e.name] ?? e.name}</span>
            <div className="rating-bar"><div style={{ width: `${(e.c / max) * 100}%` }} /></div>
            <span>{e.c}</span>
          </div>
        ))}
      </div>

      <div className="card mt-3" style={{ maxWidth: 520 }}>
        <div className="small bold mb-2">Most viewed listings</div>
        {data.top_items.length === 0 ? (
          <p className="tiny muted">Not enough data yet.</p>
        ) : (
          data.top_items.map((t, i) => (
            <div key={t.item_id} className="list-row">
              <span className="badge badge--mute">{i + 1}</span>
              <span className="grow small dim">{t.item_id.slice(0, 8)}…</span>
              <span className="small bold">{t.c} views</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
