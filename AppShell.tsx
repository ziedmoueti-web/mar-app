import { useEffect, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../state/AuthContext';
import { api } from '../api/client';
import { Icon } from './Icon';
import { Avatar } from './ui';

function useUnreadCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let stopped = false;
    const load = async () => {
      try {
        const r = await api.get<{ unread_count: number }>('/api/notifications?limit=1');
        if (!stopped) setCount(r.unread_count);
      } catch { /* ignore */ }
    };
    void load();
    const iv = window.setInterval(load, 20000);
    return () => {
      stopped = true;
      window.clearInterval(iv);
    };
  }, [user]);
  return count;
}

export function AppShell() {
  const { user } = useAuth();
  const unread = useUnreadCount();
  const location = useLocation();
  const navigate = useNavigate();
  const hideTop = location.pathname.startsWith('/onboarding') || location.pathname.startsWith('/admin');

  const tabs = [
    { to: '/', label: 'Browse', icon: Icon.home },
    { to: '/my-items', label: 'My Items', icon: Icon.box },
    { to: '/trades', label: 'Trades', icon: Icon.swap },
    { to: '/profile', label: 'Profile', icon: Icon.user },
  ];
  const showPlus = location.pathname !== '/list';

  if (!user) return <Outlet />;

  return (
    <div className="app-shell">
      {!hideTop && (
        <header className="topbar">
          <Link to="/" className="brand grow" aria-label="Badel home">
            <span className="brand-word">BADEL</span>
            <span className="brand-tag">Trade, not money</span>
          </Link>
          <div className="topbar-actions">
            <Link to="/notifications" className="icon-btn" aria-label="Notifications">
              <Icon.bell size={20} />
              {unread > 0 && <span className="icon-btn--badge" data-count={unread > 9 ? '9+' : unread} />}
            </Link>
            <Link to="/profile" className="icon-btn" aria-label="Profile" style={{ padding: 0 }}>
              <Avatar user={user} size={32} />
            </Link>
          </div>
        </header>
      )}

      <main>
        <Outlet />
      </main>

      {!hideTop && (
        <nav className="tabbar" aria-label="Primary" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {tabs.slice(0, 2).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => `tab ${isActive ? 'tab--active' : ''}`}
              onClick={() => {
                if (location.pathname === t.to) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <t.icon size={21} />
              <span>{t.label}</span>
            </NavLink>
          ))}
          <button
            className="tab"
            aria-label="New listing"
            onClick={() => navigate('/list')}
            style={{ color: 'var(--ochre)' }}
          >
            {showPlus ? (
              <span
                style={{
                  position: 'absolute',
                  top: -16,
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: 'var(--grad-brand)',
                  color: '#221503',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 6px 20px rgba(232,163,61,0.4)',
                }}
              >
                <Icon.plus size={22} strokeWidth={2.4} />
              </span>
            ) : (
              <Icon.plus size={21} />
            )}
            <span>List</span>
          </button>
          {tabs.slice(2).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) => `tab ${isActive ? 'tab--active' : ''}`}
              onClick={() => {
                if (location.pathname === t.to) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <t.icon size={21} />
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
