import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './state/AuthContext';
import { PageLoader } from './components/ui';
import { AuthPage } from './pages/AuthPage';
import { Onboarding } from './pages/Onboarding';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import { ItemDetailPage } from './pages/ItemDetailPage';
import { ListItemPage } from './pages/ListItemPage';
import { MyItemsPage } from './pages/MyItemsPage';
import { TradesPage } from './pages/TradesPage';
import { TradeDetailPage } from './pages/TradeDetailPage';
import { ProfilePage } from './pages/ProfilePage';
import { EditProfilePage } from './pages/EditProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { FavoritesPage } from './pages/FavoritesPage';
import { VerifyPage } from './pages/VerifyPage';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminItems } from './pages/admin/AdminItems';
import { AdminTrades } from './pages/admin/AdminTrades';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminCategories } from './pages/admin/AdminCategories';
import { AdminAnalytics } from './pages/admin/AdminAnalytics';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  return children;
}

function RequireOnboarded({ children }: { children: React.ReactElement }) {
  const { user, onboarded, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user && !onboarded) return <Navigate to="/onboarding" replace />;
  return children;
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <PageLoader />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/auth"
        element={user ? <Navigate to="/" replace /> : <AuthPage />}
      />
      <Route
        path="/items/:id"
        element={<RequireAuth><RequireOnboarded><ItemDetailPage /></RequireOnboarded></RequireAuth>}
      />

      {/* Authenticated + onboarded */}
      <Route element={<RequireAuth><RequireOnboarded><AppShell /></RequireOnboarded></RequireAuth>}>
        <Route path="/" element={<HomePage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/list" element={<ListItemPage />} />
        <Route path="/my-items" element={<MyItemsPage />} />
        <Route path="/trades" element={<TradesPage />} />
        <Route path="/trades/:id" element={<TradeDetailPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/u/:username" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<EditProfilePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/favorites" element={<FavoritesPage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/meetup-demo" element={<Navigate to="/trades" replace />} />
      </Route>

      {/* Onboarding */}
      <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />

      {/* Admin */}
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="items" element={<AdminItems />} />
        <Route path="trades" element={<AdminTrades />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="analytics" element={<AdminAnalytics />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
