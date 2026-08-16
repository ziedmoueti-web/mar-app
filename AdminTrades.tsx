import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client';
import { useToast } from '../../state/ToastContext';
import type { PublicUser, Item, TradeOffer } from '@shared/types';
import { ConfirmDialog, ErrorState, StatusPill } from '../../components/ui';

interface AdminTradeRow extends TradeOffer {
  from_user: PublicUser | null;
  to_user: PublicUser | null;
  offered_item: Item | null;
  requested_item: Item | null;
}

const FILTERS = ['', 'pending', 'accepted', 'meetup', 'completed', 'declined', 'cancelled', 'disputed'];

export function AdminTrades() {
  const { toast } = useToast();
  const [trades, setTrades] = useState<AdminTradeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState<{ trade: AdminTradeRow; action: 'complete' | 'cancel' } | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ trades: AdminTradeRow[] }>(`/api/admin/trades${status ? `?status=${status}` : ''}`)
      .then((r) => setTrades(r.trades))
      .catch((e) => setError(apiErrorMessage(e)));
  }, [status]);

  useEffect(load, [load]);

  const resolve = async () => {
    if (!confirm) return;
    try {
      await api.patch(`/api/admin/trades/${confirm.trade.id}`, {
        status: confirm.action === 'complete' ? 'completed' : 'cancelled',
      });
      toast('Trade resolved.', 'success');
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Trades</h1>
      <div className="row wrap mt-2 mb-2">
        {FILTERS.map((f) => (
          <button key={f} className={`chip ${status === f ? 'chip--active' : ''}`} onClick={() => setStatus(f)}>
            {f || 'all'}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !trades ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Trade</th><th>Between</th><th>Status</th><th>Created</th><th>Dispute reason</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {trades.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div className="bold small">{t.offered_item?.title ?? '—'}</div>
                    <div className="tiny muted">⇄ {t.requested_item?.title ?? '—'}</div>
                  </td>
                  <td>
                    <div className="tiny">{t.from_user?.display_name ?? '—'}</div>
                    <div className="tiny muted">→ {t.to_user?.display_name ?? '—'}</div>
                  </td>
                  <td><StatusPill status={t.status} /></td>
                  <td className="tiny">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="tiny" style={{ maxWidth: 220 }}>{t.dispute_reason ?? '—'}</td>
                  <td>
                    {t.status === 'disputed' && (
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn btn--teal btn--sm" onClick={() => setConfirm({ trade: t, action: 'complete' })}>Complete</button>
                        <button className="btn btn--danger btn--sm" onClick={() => setConfirm({ trade: t, action: 'cancel' })}>Cancel</button>
                      </div>
                    )}
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
        onConfirm={resolve}
        title={confirm?.action === 'complete' ? 'Mark trade completed?' : 'Cancel this trade?'}
        body={
          confirm?.action === 'complete'
            ? 'Both parties will be notified that the dispute was resolved in favour of completion.'
            : 'The trade will be cancelled and both items released. Both parties are notified.'
        }
        confirmLabel={confirm?.action === 'complete' ? 'Complete' : 'Cancel trade'}
        danger={confirm?.action === 'cancel'}
      />
    </div>
  );
}
