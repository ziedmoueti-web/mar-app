import { NavLink, Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../state/AuthContext';
import { Avatar } from '../../components/ui';
import { Icon } from '../../components/Icon';

const LINKS = [
  { to: '/admin', end: true, label: 'Dashboard', icon: Icon.grid },
  { to: '/admin/users', label: 'Users', icon: Icon.user },
  { to: '/admin/items', label: 'Items', icon: Icon.box },
  { to: '/admin/trades', label: 'Trades', icon: Icon.swap },
  { to: '/admin/reports', label: 'Reports', icon: Icon.flag },
  { to: '/admin/categories', label: 'Categories', icon: Icon.tag },
  { to: '/admin/analytics', label: 'Analytics', icon: Icon.barChart },
];

export function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="admin-layout">
      <aside className="admin-nav">
        <div className="brand mb-2" style={{ padding: '6px 12px 14px' }}>
          <span className="brand-word" style={{ fontSize: 20 }}>BADEL</span>
          <span className="brand-tag">Admin</span>
        </div>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            <l.icon size={16} /> {l.label}
          </NavLink>
        ))}
        <div style={{ flex: 1 }} />
        <Link to="/" className="row small dim" style={{ padding: '10px 12px' }}>
          <Icon.arrowL size={15} /> Back to app
        </Link>
        <div className="row" style={{ padding: '12px 12px 4px', gap: 8 }}>
          <Avatar user={user} size={28} />
          <span className="small bold">{user?.display_name}</span>
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
