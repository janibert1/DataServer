import { useState, Fragment } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Menu, Transition } from '@headlessui/react';
import {
  HardDrive, Users, Share2, Clock, Star, Trash2, Settings, Shield,
  Menu as MenuIcon, X, LogOut, ChevronDown, FolderOpen, Upload,
  LayoutGrid, Zap
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useLogout } from '../../hooks/useAuth';
import { StorageBar } from '../common/StorageBar';
import { NotificationDropdown } from '../common/NotificationDropdown';
import { SearchBar } from '../common/SearchBar';
import { UploadProgressPanel } from '../files/UploadProgressPanel';
import { UploadButton } from '../files/UploadDropzone';
import { useLocation } from 'react-router-dom';

const navItems = [
  { to: '/drive/my-drive', icon: HardDrive, label: 'My Drive' },
  { to: '/drive/shared-with-me', icon: Users, label: 'Shared with me' },
  { to: '/drive/shared-by-me', icon: Share2, label: 'Shared by me' },
  { to: '/drive/recent', icon: Clock, label: 'Recent' },
  { to: '/drive/starred', icon: Star, label: 'Starred' },
  { to: '/drive/trash', icon: Trash2, label: 'Trash' },
];

function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user } = useAuthStore();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-8 h-8 rounded-xl bg-brand-600 flex items-center justify-center">
          <Zap className="w-4.5 h-4.5 text-white" fill="currentColor" />
        </div>
        <span className="text-base font-bold text-slate-900 tracking-tight">DataServer</span>
        {onClose && (
          <button onClick={onClose} className="ml-auto p-1 rounded-lg hover:bg-slate-100 text-slate-400 lg:hidden">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Upload button */}
      <div className="px-4 mb-4">
        <UploadButton />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={clsx('w-4.5 h-4.5 flex-shrink-0', isActive ? 'text-brand-600' : 'text-slate-400')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-4 py-4 border-t border-slate-100 space-y-4">
        {user && (
          <StorageBar
            usedBytes={parseInt(user.storageUsedBytes ?? '0')}
            totalBytes={parseInt(user.storageQuotaBytes ?? '1')}
          />
        )}

        <div className="flex items-center gap-2">
          <NavLink
            to="/drive/settings"
            className={({ isActive }) =>
              clsx('flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')
            }
          >
            <Settings className="w-3.5 h-3.5" />
            Settings
          </NavLink>
          <NavLink
            to="/drive/security"
            className={({ isActive }) =>
              clsx('flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
                isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700')
            }
          >
            <Shield className="w-3.5 h-3.5" />
            Security
          </NavLink>
        </div>
      </div>
    </div>
  );
}

export function DriveLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuthStore();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="flex h-screen bg-surface-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-60 bg-white border-r border-slate-200 flex-shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      <Transition show={sidebarOpen} as={Fragment}>
        <div className="fixed inset-0 z-50 lg:hidden">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-150"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          </Transition.Child>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-200"
            enterFrom="-translate-x-full"
            enterTo="translate-x-0"
            leave="ease-in duration-150"
            leaveFrom="translate-x-0"
            leaveTo="-translate-x-full"
          >
            <div className="fixed inset-y-0 left-0 w-72 bg-white shadow-xl">
              <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>
          </Transition.Child>
        </div>
      </Transition>

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <SearchBar />
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <NotificationDropdown />

            {/* User menu */}
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center gap-2 pl-2 pr-1 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName} className="w-7 h-7 rounded-full object-cover" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold">
                    {user?.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <span className="text-sm font-medium text-slate-700 max-w-24 truncate hidden sm:block">{user?.displayName}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </Menu.Button>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-150"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-100"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 top-12 w-56 bg-white rounded-xl shadow-dropdown border border-slate-100 overflow-hidden focus:outline-none z-50">
                  <div className="px-4 py-3 border-b border-slate-50">
                    <p className="text-sm font-medium text-slate-900 truncate">{user?.displayName}</p>
                    <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => navigate('/drive/settings')}
                          className={clsx('w-full flex items-center gap-3 px-4 py-2 text-sm text-left', active ? 'bg-slate-50 text-slate-900' : 'text-slate-700')}
                        >
                          <Settings className="w-4 h-4" />
                          Settings
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => navigate('/drive/security')}
                          className={clsx('w-full flex items-center gap-3 px-4 py-2 text-sm text-left', active ? 'bg-slate-50 text-slate-900' : 'text-slate-700')}
                        >
                          <Shield className="w-4 h-4" />
                          Security
                        </button>
                      )}
                    </Menu.Item>
                    {user?.role === 'ADMIN' && (
                      <Menu.Item>
                        {({ active }) => (
                          <button
                            onClick={() => navigate('/admin/users')}
                            className={clsx('w-full flex items-center gap-3 px-4 py-2 text-sm text-left', active ? 'bg-slate-50 text-slate-900' : 'text-slate-700')}
                          >
                            <LayoutGrid className="w-4 h-4" />
                            Admin panel
                          </button>
                        )}
                      </Menu.Item>
                    )}
                  </div>
                  <div className="border-t border-slate-50 py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => logout.mutate()}
                          className={clsx('w-full flex items-center gap-3 px-4 py-2 text-sm text-left text-red-600', active && 'bg-red-50')}
                        >
                          <LogOut className="w-4 h-4" />
                          Sign out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <UploadProgressPanel />
    </div>
  );
}
