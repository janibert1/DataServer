import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAuthInit } from './hooks/useAuth';
import { PageLoader } from './components/common/LoadingSpinner';
import { DriveLayout } from './components/layout/DriveLayout';
import { AdminLayout } from './components/layout/AdminLayout';

// Auth pages
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { VerifyEmailPage } from './pages/auth/VerifyEmailPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { AcceptInvitePage } from './pages/auth/AcceptInvitePage';

// Drive pages
import { MyDrivePage } from './pages/drive/MyDrivePage';
import { FolderPage } from './pages/drive/FolderPage';
import { SharedWithMePage } from './pages/drive/SharedWithMePage';
import { SharedByMePage } from './pages/drive/SharedByMePage';
import { RecentPage } from './pages/drive/RecentPage';
import { StarredPage } from './pages/drive/StarredPage';
import { TrashPage } from './pages/drive/TrashPage';
import { SettingsPage } from './pages/drive/SettingsPage';
import { SecurityPage } from './pages/drive/SecurityPage';

// Admin pages
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminInvitationsPage } from './pages/admin/AdminInvitationsPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';
import { AdminStoragePage } from './pages/admin/AdminStoragePage';
import { AdminFlagsPage } from './pages/admin/AdminFlagsPage';
import { AdminPolicyPage } from './pages/admin/AdminPolicyPage';

// Other
import { NotFoundPage } from './pages/NotFoundPage';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/drive/my-drive" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  if (isLoading) return <PageLoader />;
  if (user) return <Navigate to="/drive/my-drive" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { isLoading } = useAuthInit();
  if (isLoading) return <PageLoader />;

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/drive/my-drive" replace />} />

      {/* Auth routes */}
      <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><RegisterPage /></GuestOnly>} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage />} />

      {/* Drive routes */}
      <Route path="/drive" element={<RequireAuth><DriveLayout /></RequireAuth>}>
        <Route index element={<Navigate to="my-drive" replace />} />
        <Route path="my-drive" element={<MyDrivePage />} />
        <Route path="folder/:folderId" element={<FolderPage />} />
        <Route path="shared-with-me" element={<SharedWithMePage />} />
        <Route path="shared-by-me" element={<SharedByMePage />} />
        <Route path="recent" element={<RecentPage />} />
        <Route path="starred" element={<StarredPage />} />
        <Route path="trash" element={<TrashPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="security" element={<SecurityPage />} />
      </Route>

      {/* Admin routes */}
      <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
        <Route index element={<Navigate to="users" replace />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="invitations" element={<AdminInvitationsPage />} />
        <Route path="audit" element={<AdminAuditPage />} />
        <Route path="storage" element={<AdminStoragePage />} />
        <Route path="flags" element={<AdminFlagsPage />} />
        <Route path="policy" element={<AdminPolicyPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
