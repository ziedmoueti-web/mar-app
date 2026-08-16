import { Link } from 'react-router-dom';
import type { ItemWithDetails } from '@shared/types';
import { Icon } from './Icon';
import { Stars, VerifiedBadge, timeAgo } from './ui';

function wantsText(item: ItemWithDetails): string {
  const cats = item.wanted.filter((w) => w.wanted_category_id).map((w) => item.category.name);
  void cats;
  const parts: string[] = [];
  for (const w of item.wanted) {
    if (w.wanted_keywords) parts.push(w.wanted_keywords);
    else if (w.wanted_category_id) parts.push('your ' + (item.category.icon ?? ''));
  }
  return parts.slice(0, 3).join(' · ');
}

export function MatchPill({ score }: { score: number | null }) {
  if (score == null) return null;
  if (score >= 90) {
    return <span className="match-pill">🔥 {score}%</span>;
  }
  if (score >= 70) {
    return <span className="match-pill match-pill--ok">✓ {score}%</span>;
  }
  if (score >= 45) {
    return <span className="match-pill match-pill--ok" style={{ opacity: 0.85 }}>{score}%</span>;
  }
  return null;
}

export function ItemCard({ item, onToggleFavorite, showOwner = false }: {
  item: ItemWithDetails;
  onToggleFavorite?: (item: ItemWithDetails) => void;
  showOwner?: boolean;
}) {
  const photo = item.photos[0];
  const wants = wantsText(item);
  return (
    <Link to={`/items/${item.id}`} className="item-card" aria-label={item.title}>
      <div className="item-card__img-wrap">
        {photo ? (
          <img className="item-card__img" src={photo.storage_path} alt={item.title} loading="lazy" />
        ) : (
          <div className="item-card__img" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-mute)' }}>
            {item.category.icon} <span className="tiny">{item.category.name}</span>
          </div>
        )}
        <div className="item-card__match">
          <MatchPill score={item.match_score} />
        </div>
        {onToggleFavorite && (
          <button
            className={`item-card__fav ${item.is_favorite ? 'item-card__fav--on' : ''}`}
            aria-label={item.is_favorite ? 'Remove from saved' : 'Save item'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(item);
            }}
          >
            <Icon.heart size={16} filled={item.is_favorite} />
          </button>
        )}
      </div>
      <div className="item-card__body">
        <div className="item-card__title">{item.title}</div>
        <div className="item-card__meta">
          {item.distance_km != null && (
            <span className="row" style={{ gap: 3 }}>
              <Icon.mapPin size={11} /> {item.distance_km} km
            </span>
          )}
          {showOwner && item.owner.display_name && (
            <span className="row" style={{ gap: 4 }}>
              {item.owner.display_name}
              {item.owner.verification_status === 'verified' && <VerifiedBadge small />}
            </span>
          )}
          {item.owner.rating != null && <Stars value={item.owner.rating} size={10} />}
          <span>{timeAgo(item.created_at)}</span>
        </div>
        {wants && (
          <div className="item-card__wants">
            <b>Wants:</b> {wants}
          </div>
        )}
      </div>
    </Link>
  );
}
