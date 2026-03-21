import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Users, Key, ScrollText, HardDrive, Flag, Settings2, ArrowLeft, Zap } from 'lucide-react';
import clsx from 'clsx';

const adminNavItems = [
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/invitations', icon: Key, label: 'Invitations' },
  { to: '/admin/audit', icon: ScrollText, label: 'Audit Logs' },
  { to: '/admin/storage', icon: HardDrive, label: 'Storage' },
  { to: '/admin/flags', icon: Flag, label: 'Content Flags' },
  { to: '/admin/policy', icon: Settings2, label: 'Platform Policy' },
];

export function AdminLayout() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Sidebar */}
      <aside className="flex flex-col w-56 bg-brand-900 text-white flex-shrink-0">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-brand-800">
          <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" fill="currentColor" />
          </div>
          <div>
            <p className="text-sm font-bold">DataServer</p>
            <p className="text-xs text-brand-300">Admin Panel</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {adminNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-700 text-white'
                    : 'text-brand-300 hover:bg-brand-800 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={clsx('w-4 h-4 flex-shrink-0', isActive ? 'text-white' : 'text-brand-400')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-brand-800">
          <button
            onClick={() => navigate('/drive/my-drive')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-brand-300 hover:bg-brand-800 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Drive
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
