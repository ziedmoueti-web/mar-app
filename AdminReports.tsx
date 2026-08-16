import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client';
import { useToast } from '../../state/ToastContext';
import type { Item, PublicUser, Report, ReportStatus } from '@shared/types';
import { ErrorState } from '../../components/ui';

interface AdminReportRow extends Report {
  reporter: PublicUser | null;
  reported_user: PublicUser | null;
  item: Item | null;
}

const STATUSES: ReportStatus[] = ['open', 'reviewing', 'action_taken', 'dismissed'];

export function AdminReports() {
  const { toast } = useToast();
  const [reports, setReports] = useState<AdminReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setError(null);
    api.get<{ reports: AdminReportRow[] }>('/api/admin/reports?status=all')
      .then((r) => setReports(r.reports))
      .catch((e) => setError(apiErrorMessage(e)));
  }, []);

  useEffect(load, [load]);

  const updateStatus = async (r: AdminReportRow, status: ReportStatus) => {
    try {
      await api.patch(`/api/admin/reports/${r.id}`, { status, admin_notes: notes[r.id] ?? null });
      toast(`Report ${status.replace('_', ' ')}.`, 'success');
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  const suspendUser = async (r: AdminReportRow) => {
    if (!r.reported_user) return;
    try {
      await api.patch(`/api/admin/users/${r.reported_user.id}`, { role: 'suspended' });
      await updateStatus(r, 'action_taken');
      toast('User suspended.', 'success');
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  const removeItem = async (r: AdminReportRow) => {
    if (!r.item) return;
    try {
      await api.del(`/api/admin/items/${r.item.id}`);
      await updateStatus(r, 'action_taken');
      toast('Listing removed.', 'success');
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Reports</h1>
      <p className="page-sub">Review user reports — scam, fake listings, harassment and more.</p>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !reports ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : reports.length === 0 ? (
        <div className="card center muted small" style={{ padding: 40 }}>No reports yet.</div>
      ) : (
        <div className="stack mt-2">
          {reports.map((r) => (
            <div key={r.id} className="card">
              <div className="row-between wrap">
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`badge ${r.status === 'dismissed' ? 'badge--mute' : r.status === 'action_taken' ? 'badge--teal' : 'badge--rust'}`}>{r.status}</span>
                  <span className="badge badge--ochre">{r.reason.replace(/_/g, ' ')}</span>
                  <span className="tiny muted">{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {STATUSES.map((s) => (
                    <button key={s} className={`chip ${r.status === s ? 'chip--active' : ''}`} onClick={() => void updateStatus(r, s)}>
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <p className="small dim mt-2">{r.details}</p>
              <div className="row small mt-2 wrap" style={{ gap: 12 }}>
                <span>Reported by: <b>{r.reporter?.display_name ?? '—'}</b></span>
                <span>Against: <b>{r.reported_user?.display_name ?? '—'}</b></span>
                {r.item && <span>Listing: <b>{r.item.title}</b></span>}
              </div>
              <div className="row mt-2 wrap" style={{ gap: 8 }}>
                <input
                  className="input grow"
                  style={{ minWidth: 200 }}
                  placeholder="Admin notes…"
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                />
                {r.reported_user && r.reported_user.role !== 'suspended' && (
                  <button className="btn btn--danger btn--sm" onClick={() => void suspendUser(r)}>Suspend user</button>
                )}
                {r.item && <button className="btn btn--danger btn--sm" onClick={() => void removeItem(r)}>Remove listing</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
