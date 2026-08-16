import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import type { Category, ItemCondition, ItemWithDetails, Paginated } from '@shared/types';
import { ItemCard } from '../components/ItemCard';
import { EmptyState, ErrorState, SkeletonCard, Spinner } from '../components/ui';
import { Icon } from '../components/Icon';

const CONDITIONS: { v: ItemCondition; label: string }[] = [
  { v: 'new', label: 'New' },
  { v: 'like_new', label: 'Like new' },
  { v: 'good', label: 'Good' },
  { v: 'fair', label: 'Fair' },
  { v: 'poor', label: 'Poor' },
];

const SORTS = [
  { v: 'newest', label: 'Newest' },
  { v: 'closest', label: 'Closest' },
  { v: 'recommended', label: 'Recommended' },
] as const;

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const conditions = params.get('conditions')?.split(',') ?? [];
  const distance = params.get('distance') ?? '';
  const sort = (params.get('sort') ?? 'newest') as 'newest' | 'closest' | 'recommended';

  const [cats, setCats] = useState<Category[]>([]);
  const [result, setResult] = useState<Paginated<ItemWithDetails> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.get<{ categories: Category[] }>('/api/categories').then((r) => setCats(r.categories)).catch(() => {});
  }, []);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (category) p.set('category_id', category);
    if (conditions.length) p.set('conditions', conditions.join(','));
    if (distance) p.set('max_distance_km', distance);
    p.set('sort', sort);
    p.set('page', String(page));
    p.set('per_page', '20');
    return p.toString();
  }, [q, category, conditions, distance, sort, page]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get<Paginated<ItemWithDetails>>(`/api/items?${query}`)
      .then(setResult)
      .catch((e) => setError(apiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [query]);

  useEffect(load, [load]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
    setPage(1);
  };

  const toggleCondition = (c: ItemCondition) => {
    const next = conditions.includes(c) ? conditions.filter((x) => x !== c) : [...conditions, c];
    update({ conditions: next.length ? next.join(',') : null });
  };

  return (
    <div className="page page--flush">
      <div className="topbar" style={{ position: 'sticky', top: 0, margin: '0 -16px', padding: '0 16px' }}>
        <form
          className="row grow"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: q.trim() || null });
          }}
        >
          <div className="grow" style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-mute)' }}>
              <Icon.search size={16} />
            </span>
            <input
              className="input"
              style={{ paddingLeft: 36 }}
              value={q}
              onChange={(e) => update({ q: e.target.value || null })}
              placeholder="Search listings…"
              aria-label="Search"
            />
          </div>
          <button className="icon-btn" type="button" aria-label="Filters" onClick={() => setShowFilters((s) => !s)}>
            <Icon.settings size={19} />
          </button>
        </form>
      </div>

      {showFilters && (
        <div className="card mt-2 fade-in">
          <div className="small bold mb-1">Category</div>
          <div className="row wrap mb-2">
            <button className={`chip ${!category ? 'chip--active' : ''}`} onClick={() => update({ category: null })}>All</button>
            {cats.map((c) => (
              <button key={c.id} className={`chip ${category === c.id ? 'chip--active' : ''}`} onClick={() => update({ category: category === c.id ? null : c.id })}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>

          <div className="small bold mb-1">Condition</div>
          <div className="row wrap mb-2">
            {CONDITIONS.map((c) => (
              <button key={c.v} className={`chip ${conditions.includes(c.v) ? 'chip--active' : ''}`} onClick={() => toggleCondition(c.v)}>
                {c.label}
              </button>
            ))}
          </div>

          <div className="small bold mb-1">Distance</div>
          <div className="row wrap mb-1">
            {[
              { v: '', label: 'Anywhere' },
              { v: '5', label: '≤ 5 km' },
              { v: '15', label: '≤ 15 km' },
              { v: '30', label: '≤ 30 km' },
              { v: '60', label: '≤ 60 km' },
            ].map((d) => (
              <button key={d.v} className={`chip ${distance === d.v ? 'chip--active' : ''}`} onClick={() => update({ distance: d.v || null })}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="tab-bar mt-2">
        {SORTS.map((s) => (
          <button key={s.v} className={`tab-item ${sort === s.v ? 'tab-item--active' : ''}`} onClick={() => update({ sort: s.v })}>
            {s.label}
          </button>
        ))}
        <span className="grow" />
        <span className="tab-item muted">{result ? `${result.total} result${result.total === 1 ? '' : 's'}` : ''}</span>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading && !result ? (
        <div className="item-grid">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : !result || result.items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="No listings found"
          body="Try a different keyword, or widen the filters. New items appear every day."
          action={
            <button className="btn btn--ghost btn--sm" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
              Clear filters
            </button>
          }
        />
      ) : (
        <>
          <div className="item-grid">
            {result.items.map((item) => (
              <ItemCard key={item.id} item={item} showOwner />
            ))}
          </div>
          {loading && <div className="center mt-2"><Spinner /></div>}
          {result.total > result.items.length && (
            <div className="center mt-3">
              <button className="btn btn--ghost" onClick={() => setPage((p) => p + 1)} disabled={loading}>
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
