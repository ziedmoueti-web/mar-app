import { useCallback, useEffect, useState } from 'react';
import { api, apiErrorMessage } from '../../api/client';
import { useToast } from '../../state/ToastContext';
import type { PublicUser } from '@shared/types';
import { Avatar, ErrorState } from '../../components/ui';

interface AdminUserRow extends PublicUser { email: string }

export function AdminUsers() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.get<{ users: AdminUserRow[] }>(`/api/admin/users?search=${encodeURIComponent(search)}`)
      .then((r) => setUsers(r.users))
      .catch((e) => setError(apiErrorMessage(e)));
  }, [search]);

  useEffect(load, [load]);

  const update = async (id: string, patch: Record<string, string>) => {
    setBusyId(id);
    try {
      await api.patch(`/api/admin/users/${id}`, patch);
      toast('User updated.', 'success');
      load();
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <h1 className="page-title" style={{ fontSize: 22 }}>Users</h1>
      <div className="row mt-2 mb-2" style={{ maxWidth: 360 }}>
        <input className="input" placeholder="Search by name, username or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !users ? (
        <div className="skeleton" style={{ height: 200 }} />
      ) : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>User</th><th>Location</th><th>Rating</th><th>Trades</th><th>Verified</th><th>Membership</th><th>Role</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="row" style={{ gap: 8 }}>
                      <Avatar user={u} size={30} />
                      <div>
                        <div className="bold small">{u.display_name}</div>
                        <div className="tiny muted">{u.username} · {u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{u.location}</td>
                  <td>{u.rating != null ? `${u.rating.toFixed(1)} ★` : '—'}</td>
                  <td>{u.completed_trades}</td>
                  <td>{u.verification_status}</td>
                  <td>{u.membership_status}</td>
                  <td>{u.role}</td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                      {u.role !== 'suspended' ? (
                        <button className="btn btn--danger btn--sm" disabled={busyId === u.id} onClick={() => void update(u.id, { role: 'suspended' })}>
                          Suspend
                        </button>
                      ) : (
                        <button className="btn btn--teal btn--sm" disabled={busyId === u.id} onClick={() => void update(u.id, { role: 'user' })}>
                          Restore
                        </button>
                      )}
                      {u.role === 'user' && (
                        <button className="btn btn--soft btn--sm" disabled={busyId === u.id} onClick={() => void update(u.id, { role: 'admin' })}>
                          Make admin
                        </button>
                      )}
                      {u.verification_status !== 'verified' && (
                        <button className="btn btn--soft btn--sm" disabled={busyId === u.id} onClick={() => void update(u.id, { verification_status: 'verified' })}>
                          Verify
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
