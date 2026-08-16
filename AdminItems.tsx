import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../../api/client';
import { useToast } from '../../state/ToastContext';
import type { Item, PublicUser } from '@shared/types';
import { ConfirmDialog, ErrorState } from '../../components/ui';

interface AdminItemRow extends Item { owner: PublicUser | null }

export function AdminItems() {
  const { toast } = useToast();
  const [items, setItems] = useState<AdminItemRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<AdminItemRow | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ items: AdminItemRow[] }>(`/api/admin/items?search=${encodeURIComponent(search)}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(apiErrorMessage(e)));
  }, [search]);

  useEffect(load, [load]);

  const del = async () => {
    if (!confirm) return;
    try {
      await api.del(`/api/admin/items/${confirm.id}`);
      toast('Listing removed.', 'success');
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setConfirm(null);
    }
  };

  const setStatus = async (id: string, status: 'active' | 'unavailable') => {
    try {
      await api.patch(`/api/admin/items/${id}`, { status });
      toast(status === 'active' ? 'Listing restored.' : 'Listing hidden.', 'success');
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Items</h1>
      <div className="row mt-2 mb-2" style={{ maxWidth: 360 }}>
        <input className="input" placeholder="Search listings…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !items ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Listing</th><th>Owner</th><th>Category</th><th>Condition</th><th>Status</th><th>Value</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link to={`/items/${i.id}`} className="bold small">{i.title}</Link>
                    <div className="tiny muted">{i.location}</div>
                  </td>
                  <td>{i.owner?.display_name ?? '—'}</td>
                  <td>{i.category_id.slice(0, 8)}</td>
                  <td>{i.condition}</td>
                  <td>{i.status}</td>
                  <td>{i.value_min != null ? `${i.value_min}–${i.value_max} ${i.value_currency}` : '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {i.status === 'active' ? (
                        <button className="btn btn--soft btn--sm" onClick={() => void setStatus(i.id, 'unavailable')}>Hide</button>
                      ) : (
                        <button className="btn btn--teal btn--sm" onClick={() => void setStatus(i.id, 'active')}>Restore</button>
                      )}
                      <button className="btn btn--danger btn--sm" onClick={() => setConfirm(i)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={del}
        title="Remove listing?"
        body={confirm ? `"${confirm.title}" will be permanently removed and the owner will be notified.` : ''}
        confirmLabel="Remove"
        danger
      />
    </div>
  );
}
