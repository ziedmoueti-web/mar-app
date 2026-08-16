import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useToast } from '../state/ToastContext';
import type { ItemWithDetails } from '@shared/types';
import { ConfirmDialog, EmptyState, ErrorState, SkeletonCard } from '../components/ui';
import { Icon } from '../components/Icon';
import { MatchPill } from '../components/ItemCard';

export function MyItemsPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<ItemWithDetails[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ item: ItemWithDetails; action: 'delete' | 'hide' | 'relist' } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api.get<{ items: ItemWithDetails[] }>('/api/items/mine')
      .then((r) => setItems(r.items))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(load, [load]);

  const doAction = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === 'delete') {
        await api.del(`/api/items/${confirm.item.id}`);
        toast('Listing deleted.', 'success');
      } else {
        await api.patch(`/api/items/${confirm.item.id}/status`, {
          status: confirm.action === 'hide' ? 'unavailable' : 'active',
        });
        toast(confirm.action === 'hide' ? 'Marked unavailable.' : 'Relisted — it is live again.', 'success');
      }
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const active = items?.filter((i) => i.status === 'active') ?? [];
  const hidden = items?.filter((i) => i.status !== 'active') ?? [];

  return (
    <div className="page">
      <div className="row-between">
        <div>
          <h1 className="page-title">My Items</h1>
          <p className="page-sub">Manage your listings and offers.</p>
        </div>
        <Link to="/list" className="btn btn--primary btn--sm"><Icon.plus size={15} /> New</Link>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !items ? (
        <div className="item-grid mt-2">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="📦"
          title="Nothing listed yet"
          body="List something you own — it only takes a minute. Barter works both ways."
          action={<Link to="/list" className="btn btn--primary">List your first item</Link>}
        />
      ) : (
        <div className="stack mt-2">
          <h2 className="section-title" style={{ fontSize: 15 }}>Active ({active.length})</h2>
          {active.length === 0 && <p className="muted small">No active listings.</p>}
          {active.map((item) => (
            <div key={item.id} className="trade-card">
              <Link to={`/items/${item.id}`} className="trade-card__thumb" style={{ overflow: 'hidden' }}>
                {item.photos[0] ? (
                  <img src={item.photos[0].storage_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ display: 'grid', placeItems: 'center', height: '100%' }}>{item.category.icon}</span>
                )}
              </Link>
              <div className="grow" style={{ minWidth: 0 }}>
                <Link to={`/items/${item.id}`} className="bold" style={{ fontSize: 14, display: 'block' }}>{item.title}</Link>
                <div className="row small muted mt-1" style={{ gap: 8 }}>
                  <span>{item.category.name}</span>
                  <span>·</span>
                  <span>{item.location}</span>
                </div>
                <div className="row mt-1" style={{ gap: 8 }}>
                  <MatchPill score={item.match_score} />
                  {item.active_offer_count > 0 && (
                    <Link to="/trades" className="badge badge--ochre" style={{ textDecoration: 'none' }}>
                      <Icon.swap size={11} /> {item.active_offer_count} offer{item.active_offer_count > 1 ? 's' : ''}
                    </Link>
                  )}
                </div>
              </div>
              <div className="row" style={{ gap: 4, flexDirection: 'column', alignItems: 'flex-end' }}>
                <Link to={`/list?edit=${item.id}`} className="icon-btn" aria-label="Edit"><Icon.edit size={16} /></Link>
                <button className="icon-btn" aria-label="Mark unavailable" onClick={() => setConfirm({ item, action: 'hide' })}>
                  <Icon.eyeOff size={16} />
                </button>
                <button className="icon-btn" aria-label="Delete" onClick={() => setConfirm({ item, action: 'delete' })}>
                  <Icon.trash size={16} />
                </button>
              </div>
            </div>
          ))}

          {hidden.length > 0 && (
            <>
              <h2 className="section-title" style={{ fontSize: 15, marginTop: 8 }}>Unavailable ({hidden.length})</h2>
              {hidden.map((item) => (
                <div key={item.id} className="trade-card" style={{ opacity: 0.72 }}>
                  <div className="trade-card__thumb" style={{ overflow: 'hidden' }}>
                    {item.photos[0] && <img src={item.photos[0].storage_path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <span className="bold" style={{ fontSize: 14 }}>{item.title}</span>
                    <div className="small muted mt-1">
                      {item.status === 'traded' ? 'Traded — no longer available' : 'Marked unavailable'}
                    </div>
                  </div>
                  {item.status === 'unavailable' && (
                    <button className="btn btn--soft btn--sm" onClick={() => setConfirm({ item, action: 'relist' })}>
                      <Icon.refresh size={13} /> Relist
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={doAction}
        title={confirm?.action === 'delete' ? 'Delete listing?' : confirm?.action === 'hide' ? 'Mark unavailable?' : 'Relist item?'}          body={
            confirm?.action === 'delete'
              ? `"${confirm?.item.title}" will be permanently removed.`
              : confirm?.action === 'hide'
                ? `"${confirm?.item.title}" will be hidden from Browse and search.`
                : `"${confirm?.item.title}" will appear in Browse and search again.`
          }
        confirmLabel={confirm?.action === 'delete' ? 'Delete' : 'Confirm'}
        danger={confirm?.action === 'delete'}
        busy={busy}
      />
    </div>
  );
}
