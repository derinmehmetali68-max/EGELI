import React, { useState, useEffect, createContext, useContext } from 'react';
import api from '../api';
import { getCurrentUser } from '../utils/auth';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [systemNotifications, setSystemNotifications] = useState([]);
  const [userNotifications, setUserNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userUnreadCount, setUserUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  const user = getCurrentUser();

  useEffect(() => {
    if (!user) return;
    loadSystemNotifications();
    loadUserNotifications();
    const interval = setInterval(() => {
      loadSystemNotifications();
      loadUserNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  async function loadSystemNotifications() {
    try {
      const res = await api.get('/notifications/system');
      setSystemNotifications(res.data.items || []);
      const unread = (res.data.items || []).filter(n => !n.read).length;
      setUnreadCount(unread);
    } catch {}
  }

  async function loadUserNotifications() {
    if (!user) return;
    try {
      const res = await api.get('/notifications');
      setUserNotifications(res.data.items || []);
      const unread = (res.data.items || []).filter(n => !n.read).length;
      setUserUnreadCount(unread);
    } catch {}
  }

  async function markAsRead(id, isUserNotification = false) {
    try {
      if (isUserNotification) {
        await api.post(`/notifications/${id}/read`);
      } else {
        await api.post(`/notifications/system/${id}/read`);
      }
      if (isUserNotification) {
        loadUserNotifications();
      } else {
        loadSystemNotifications();
      }
    } catch {}
  }

  async function markAllAsRead(isUserNotification = false) {
    try {
      if (isUserNotification) {
        await api.post('/notifications/read-all');
      } else {
        await api.post('/notifications/system/read-all');
      }
      if (isUserNotification) {
        loadUserNotifications();
      } else {
        loadSystemNotifications();
      }
    } catch {}
  }

  async function deleteNotification(id, isUserNotification = false) {
    try {
      if (isUserNotification) {
        await api.delete(`/notifications/${id}`);
      } else {
        await api.delete(`/notifications/system/${id}`);
      }
      if (isUserNotification) {
        loadUserNotifications();
      } else {
        loadSystemNotifications();
      }
    } catch {}
  }

  return (
    <NotificationContext.Provider value={{
      systemNotifications,
      userNotifications,
      unreadCount,
      userUnreadCount,
      loadSystemNotifications,
      loadUserNotifications,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      open,
      setOpen,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function NotificationCenter() {
  const {
    systemNotifications,
    userNotifications,
    unreadCount,
    userUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    open,
    setOpen,
  } = useContext(NotificationContext);
  const [activeTab, setActiveTab] = useState('user');
  const totalUnread = userUnreadCount + unreadCount;

  if (!getCurrentUser()) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-lg px-4 py-2 shadow-sm transition"
        title="Bildirimler"
      >
        🔔
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-96 bg-white dark:bg-slate-800 rounded-lg shadow-xl z-50 border border-slate-200 dark:border-slate-700">
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setActiveTab('user')}
                className={`flex-1 px-4 py-2 text-sm font-medium ${
                  activeTab === 'user'
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
              >
                Kullanıcı {userUnreadCount > 0 && `(${userUnreadCount})`}
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`flex-1 px-4 py-2 text-sm font-medium ${
                  activeTab === 'system'
                    ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-750'
                }`}
              >
                Sistem {unreadCount > 0 && `(${unreadCount})`}
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {activeTab === 'user' ? (
                userNotifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    Bildirim yok
                  </div>
                ) : (
                  <>
                    {userNotifications.length > 0 && (
                      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => markAllAsRead(true)}
                          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          Tümünü okundu işaretle
                        </button>
                      </div>
                    )}
                    {userNotifications.map(notif => (
                      <div
                        key={notif.id}
                        className={`p-3 border-b border-slate-100 dark:border-slate-700 ${
                          !notif.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {notif.title}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                              {notif.message}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              {new Date(notif.created_at).toLocaleString('tr-TR')}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            {!notif.read && (
                              <button
                                onClick={() => markAsRead(notif.id, true)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Okundu
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notif.id, true)}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )
              ) : (
                systemNotifications.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slate-500 dark:text-slate-400">
                    Bildirim yok
                  </div>
                ) : (
                  <>
                    {systemNotifications.length > 0 && (
                      <div className="p-2 border-b border-slate-200 dark:border-slate-700">
                        <button
                          onClick={() => markAllAsRead(false)}
                          className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                        >
                          Tümünü okundu işaretle
                        </button>
                      </div>
                    )}
                    {systemNotifications.map(notif => (
                      <div
                        key={notif.id}
                        className={`p-3 border-b border-slate-100 dark:border-slate-700 ${
                          !notif.read ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {notif.title}
                            </p>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                              {notif.message}
                            </p>
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                              {new Date(notif.created_at).toLocaleString('tr-TR')}
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            {!notif.read && (
                              <button
                                onClick={() => markAsRead(notif.id, false)}
                                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Okundu
                              </button>
                            )}
                            <button
                              onClick={() => deleteNotification(notif.id, false)}
                              className="text-xs text-red-600 dark:text-red-400 hover:underline"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationCenter;

