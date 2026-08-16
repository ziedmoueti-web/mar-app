import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../api/client';
import { useToast } from '../state/ToastContext';
import type { ItemWithDetails } from '@shared/types';
import { ItemCard } from '../components/ItemCard';
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui';

export function FavoritesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ItemWithDetails[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ items: ItemWithDetails[] }>('/api/items/favorites/mine')
      .then((r) => setItems(r.items))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(load, [load]);

  const remove = async (item: ItemWithDetails) => {
    try {
      await api.del(`/api/items/${item.id}/favorite`);
      toast('Removed from saved.', 'success');
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Saved items</h1>
      <p className="page-sub">We notify you when a saved listing changes or becomes unavailable.</p>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !items ? (
        <div className="item-grid mt-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="🤍"
          title="Nothing saved yet"
          body="Tap the heart on any listing to save it for later."
        />
      ) : (
        <div className="item-grid mt-2">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} onToggleFavorite={remove} />
          ))}
        </div>
      )}
    </div>
  );
}
