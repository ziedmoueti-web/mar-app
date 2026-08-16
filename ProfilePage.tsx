import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import type { UserProfile } from '@shared/types';
import { Avatar, ErrorState, Stars, VerifiedBadge, formatDate, timeAgo } from '../components/ui';
import { ItemCard } from '../components/ItemCard';
import { Icon } from '../components/Icon';

export function ProfilePage() {
  const { username } = useParams<{ username?: string }>();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const target = username ?? me?.username ?? '';
  const isMe = !username || username === me?.username;

  const load = useCallback(() => {
    setError(null);
    api.get<UserProfile>(`/api/users/${target}`)
      .then(setProfile)
      .catch((e) => setError(apiErrorMessage(e)));
  }, [target]);

  useEffect(load, [load]);

  if (error) return <div className="page"><ErrorState message={error} onRetry={load} /></div>;
  if (!profile) return <div className="page"><div className="skeleton" style={{ height: 260 }} /></div>;

  const ratings = profile.recent_ratings ?? [];

  return (
    <div className="page">
      {/* Header */}
      <div className="profile-head">
        <Avatar user={profile} size={84} ring={profile.verification_status === 'verified'} />
        <div className="row" style={{ gap: 8 }}>
          <h1 className="page-title" style={{ fontSize: 24 }}>{profile.display_name}</h1>
          {profile.verification_status === 'verified' && <VerifiedBadge />}
        </div>
        <div className="tiny muted">@{profile.username} · member since {formatDate(profile.created_at)}</div>
        {profile.bio && <p className="small dim" style={{ maxWidth: 420 }}>{profile.bio}</p>}
        <div className="row small dim" style={{ gap: 5 }}>
          <Icon.mapPin size={13} /> {profile.location || 'Tunisia'}
        </div>

        <div className="trust-strip mt-1">
          <span className="badge badge--ochre"><Stars value={profile.rating} size={11} /></span>
          <span className="badge badge--mute"><Icon.check size={12} /> {profile.completed_trades} completed trades</span>
          {profile.successful_trade_pct != null && (
            <span className="badge badge--teal">{profile.successful_trade_pct}% success</span>
          )}
          <span className={`badge ${profile.membership_status === 'premium' ? 'badge--violet' : profile.verification_status === 'verified' ? 'badge--teal' : 'badge--mute'}`}>
            {profile.verification_status === 'verified' ? '✓ Verified member' : 'Unverified'}
          </span>
        </div>

        {isMe && (
          <div className="row mt-1" style={{ gap: 8 }}>
            <Link to="/profile/edit" className="btn btn--soft btn--sm"><Icon.edit size={13} /> Edit profile</Link>
            <Link to="/settings" className="btn btn--ghost btn--sm"><Icon.settings size={13} /> Settings</Link>
            {profile.membership_status === 'free' && (
              <Link to="/verify" className="btn btn--primary btn--sm"><Icon.shield size={13} /> Get verified</Link>
            )}
            {me?.role === 'admin' && <Link to="/admin" className="btn btn--ghost btn--sm">Admin</Link>}
          </div>
        )}
      </div>

      {/* Rating breakdown */}
      {isMe && profile.rating != null && (
        <div className="card mb-2">
          <div className="small bold mb-2">Rating breakdown</div>
          <div className="rating-bars">
            {[
              { k: 'reliability', label: 'Reliability' },
              { k: 'communication', label: 'Communication' },
              { k: 'item_accuracy', label: 'Item accuracy' },
            ].map((r) => {
              const v = profile.ratings_summary[r.k as keyof typeof profile.ratings_summary];
              return (
                <div key={r.k} className="rating-bar-row">
                  <span>{r.label}</span>
                  <div className="rating-bar"><div style={{ width: v != null ? `${(v / 5) * 100}%` : '0%' }} /></div>
                  <span className="center">{v != null ? v.toFixed(1) : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent ratings */}
      {ratings.length > 0 && (
        <div className="card mb-2">
          <div className="small bold mb-1">Recent ratings</div>
          {ratings.map((r) => (
            <div key={r.id} className="list-row" style={{ alignItems: 'flex-start' }}>
              <Stars value={r.overall} size={12} />
              <div className="grow small dim">{r.comment || 'No comment'}</div>
              <span className="tiny muted">{timeAgo(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Listings */}
      <div className="row-between mb-2">
        <h2 className="section-title">Listings ({profile.listings.length})</h2>
      </div>
      {profile.listings.length === 0 ? (
        <div className="card center muted small" style={{ padding: 28 }}>
          {isMe ? 'You have not listed anything yet.' : `${profile.display_name} has no active listings.`}
        </div>
      ) : (
        <div className="item-grid">
          {profile.listings.map((item) => <ItemCard key={item.id} item={item} showOwner={false} />)}
        </div>
      )}
    </div>
  );
}
