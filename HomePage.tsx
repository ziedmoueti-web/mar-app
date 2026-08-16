import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import type { HomeFeed, ItemWithDetails } from '@shared/types';
import { ItemCard } from '../components/ItemCard';
import { ErrorState, SkeletonCard } from '../components/ui';
import { Icon } from '../components/Icon';

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [feed, setFeed] = useState<HomeFeed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);

  const load = () => {
    setError(null);
    api.get<HomeFeed>('/api/home')
      .then(setFeed)
      .catch((e) => setError(apiErrorMessage(e)));
  };

  useEffect(load, []);

  const toggleFavorite = async (item: ItemWithDetails) => {
    try {
      if (item.is_favorite) {
        await api.del(`/api/items/${item.id}/favorite`);
      } else {
        await api.post(`/api/items/${item.id}/favorite`);
      }
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  const sections = feed?.sections ?? [];
  const filteredSections = catFilter
    ? sections
        .map((s) => ({ ...s, items: s.items.filter((i) => i.category.slug === catFilter) }))
        .filter((s) => s.items.length > 0)
    : sections;

  return (
    <div className="page page--flush">
      {/* Hero */}
      <div className="hero-banner mt-1">
        <p className="kicker">Trade, not money</p>
        <h2 className="serif mt-1">Find what you need.<br />Trade what you have.</h2>
        <p className="small">Barter with people around you — Megrine, La Marsa, Ben Arous and beyond.</p>
      </div>

      {/* Search */}
      <form
        className="row mt-2"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <div className="grow" style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)' }}>
            <Icon.search size={17} />
          </span>
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            placeholder="Search listings… e.g. iPhone, PS5, bike"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search listings"
          />
        </div>
        <button className="btn btn--primary" type="submit" aria-label="Search">
          <Icon.search size={17} />
        </button>
      </form>

      {/* Category chips */}
      <div className="scroll-row" style={{ marginTop: 14 }}>
        <button className={`chip ${!catFilter ? 'chip--active' : ''}`} onClick={() => setCatFilter(null)}>All</button>
        {feed?.sections[0] && (
          <>
            {feed.sections[0].items.length === 0 && null}
            {Array.from(new Map(feed.sections.flatMap((s) => s.items).map((i) => [i.category.id, i.category])).values())
              .slice(0, 10)
              .map((c) => (
                <button
                  key={c.id}
                  className={`chip ${catFilter === c.slug ? 'chip--active' : ''}`}
                  onClick={() => setCatFilter(catFilter === c.slug ? null : c.slug)}
                >
                  {c.icon} {c.name}
                </button>
              ))}
          </>
        )}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !feed ? (
        <div className="item-grid mt-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="stack-lg mt-3">
          {filteredSections.map((section) => (
            <section key={section.key}>
              <div className="row-between mb-1">
                <div>
                  <h2 className="section-title">{section.title}</h2>
                  <p className="tiny muted">{section.subtitle}</p>
                </div>
                {section.items.length > 4 && (
                  <Link to={`/search?sort=${section.key === 'nearby' ? 'closest' : 'recommended'}`} className="small bold" style={{ color: 'var(--ochre)' }}>
                    See all
                  </Link>
                )}
              </div>
              {section.items.length === 0 ? (
                <div className="card center muted small" style={{ padding: 24 }}>
                  {user && section.key === 'matches'
                    ? 'Add items and tell us what you want — we will find your matches here.'
                    : 'Nothing here yet.'}
                </div>
              ) : (
                <div className="scroll-row">
                  {section.items.map((item) => (
                    <ItemCard key={item.id} item={item} onToggleFavorite={toggleFavorite} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      <div className="center muted tiny mt-3" style={{ paddingBottom: 8 }}>
        Badel is a demo marketplace — all users, listings and trades shown are fictional.
      </div>
    </div>
  );
}
