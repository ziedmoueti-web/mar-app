import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../api/client';
import { useAuth } from '../state/AuthContext';
import { useToast } from '../state/ToastContext';
import { Icon } from '../components/Icon';

interface SettingsShape {
  notifications?: Record<string, boolean>;
  privacy?: Record<string, boolean>;
}

export function SettingsPage() {
  const { user, logout, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<SettingsShape>({});
  const [blocked, setBlocked] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ settings: SettingsShape }>('/api/me/settings').then((r) => setSettings(r.settings)).catch(() => {});
    api.get<{ blocked: string[] }>('/api/users/me/blocked').then((r) => setBlocked(r.blocked)).catch(() => {});
  }, []);

  const saveSetting = async (patch: SettingsShape) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      await api.patch('/api/me/settings', next);
      toast('Settings saved.', 'success');
    } catch (e) {
      toast(apiErrorMessage(e), 'error');
    }
  };

  const toggle = (group: 'notifications' | 'privacy', key: string) => {
    const cur = settings[group] ?? {};
    void saveSetting({ [group]: { ...cur, [key]: !cur[key] } });
  };

  const notifyValue = (key: string) => !!settings.notifications?.[key];
  const privacyValue = (key: string) => !!settings.privacy?.[key];

  const doLogout = async () => {
    await logout();
    navigate('/auth');
  };

  if (!user) return null;

  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <div className="row-between">
        <h1 className="page-title">Settings</h1>
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><Icon.x size={18} /></button>
      </div>

      <div className="card mt-2">
        <div className="small bold mb-1">Notifications</div>
        {[
          { key: 'offers', label: 'New trade offers' },
          { key: 'messages', label: 'Messages' },
          { key: 'updates', label: 'Offer status changes (accepted, declined, completed)' },
          { key: 'favorites', label: 'Saved-listing changes' },
          { key: 'matches', label: 'Similar items & match alerts' },
        ].map((n) => (
          <label key={n.key} className="list-row" style={{ cursor: 'pointer' }}>
            <span className="grow small">{n.label}</span>
            <input
              type="checkbox"
              checked={notifyValue(n.key)}
              onChange={() => toggle('notifications', n.key)}
              style={{ accentColor: 'var(--ochre)', width: 18, height: 18 }}
            />
          </label>
        ))}
      </div>

      <div className="card mt-2">
        <div className="small bold mb-1">Privacy</div>
        <label className="list-row" style={{ cursor: 'pointer' }}>
          <span className="grow small">Show my approximate area on my profile</span>
          <input
            type="checkbox"
            checked={privacyValue('show_location') !== false}
            onChange={() => toggle('privacy', 'show_location')}
            style={{ accentColor: 'var(--ochre)', width: 18, height: 18 }}
          />
        </label>
        <p className="tiny muted" style={{ paddingLeft: 2 }}>Your exact address is never shared publicly on Badel.</p>
      </div>

      {blocked.length > 0 && (
        <div className="card mt-2">
          <div className="small bold mb-1">Blocked users ({blocked.length})</div>
          {blocked.map((id) => (
            <div key={id} className="list-row">
              <span className="grow small dim">{id.slice(0, 8)}…</span>
              <button className="btn btn--soft btn--sm" onClick={() => api.post(`/api/users/${id}/unblock`).then(() => setBlocked((b) => b.filter((x) => x !== id)))}>
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card mt-2">
        <div className="small bold mb-1">Account</div>
        <div className="list-row">
          <span className="grow small">Email</span>
          <span className="small dim">{user.email ?? '—'}</span>
        </div>
        <div className="list-row">
          <span className="grow small">Membership</span>
          <span className={`badge ${user.membership_status === 'premium' ? 'badge--violet' : user.verification_status === 'verified' ? 'badge--teal' : 'badge--mute'}`}>
            {user.membership_status}
          </span>
        </div>
        <button className="btn btn--danger btn--block mt-1" onClick={doLogout}>
          <Icon.logout size={15} /> Sign out
        </button>
      </div>

      <div className="center muted tiny mt-3">
        Badel demo build — fictional data only. No real payments are processed.
      </div>
    </div>
  );
}
