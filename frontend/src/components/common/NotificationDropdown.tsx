import { Fragment } from 'react';
import { Menu, Transition } from '@headlessui/react';
import { Bell, Check, Trash2, FolderOpen, Shield, HardDrive, AlertTriangle, UserCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { useNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from '../../hooks/useNotifications';
import { Notification, NotificationType } from '../../types';
import { LoadingSpinner } from './LoadingSpinner';

function NotificationIcon({ type }: { type: NotificationType }) {
  const icons: Record<NotificationType, { icon: typeof Bell; color: string }> = {
    FOLDER_SHARED: { icon: FolderOpen, color: 'text-brand-600 bg-brand-50' },
    INVITATION_ACCEPTED: { icon: UserCheck, color: 'text-green-600 bg-green-50' },
    ACCESS_REVOKED: { icon: AlertTriangle, color: 'text-amber-600 bg-amber-50' },
    STORAGE_NEARLY_FULL: { icon: HardDrive, color: 'text-orange-600 bg-orange-50' },
    SUSPICIOUS_LOGIN: { icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
    SECURITY_CHANGE: { icon: Shield, color: 'text-purple-600 bg-purple-50' },
    FILE_FLAGGED: { icon: AlertTriangle, color: 'text-red-600 bg-red-50' },
  };

  const config = icons[type];
  const Icon = config.icon;

  return (
    <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', config.color)}>
      <Icon className="w-4 h-4" />
    </div>
  );
}

function NotificationItem({ notification, onMarkRead }: { notification: Notification; onMarkRead: (id: string) => void }) {
  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors',
        !notification.isRead && 'bg-brand-50/40'
      )}
      onClick={() => {
        if (!notification.isRead) onMarkRead(notification.id);
        if (notification.link) window.location.href = notification.link;
      }}
    >
      <NotificationIcon type={notification.type} />
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm', !notification.isRead ? 'font-medium text-slate-900' : 'text-slate-700')}>
          {notification.title}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notification.body}</p>
        <p className="text-xs text-slate-400 mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
        </p>
      </div>
      {!notification.isRead && (
        <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5" />
      )}
    </div>
  );
}

export function NotificationDropdown() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <Menu as="div" className="relative">
      <Menu.Button className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-brand-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Menu.Button>

      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="transform opacity-0 scale-95 translate-y-1"
        enterTo="transform opacity-100 scale-100 translate-y-0"
        leave="transition ease-in duration-100"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <Menu.Items
          className="absolute right-0 top-12 w-96 bg-white rounded-2xl shadow-dropdown border border-slate-100 overflow-hidden focus:outline-none z-50"
          static
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                <Check className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-50">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => markRead.mutate(id)}
                />
              ))
            )}
          </div>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
