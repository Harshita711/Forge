import { type ReactNode, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { Notification } from '../lib/types';
import { Bell } from "lucide-react";

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (open) {
      api.get<{ data: Notification[] }>('/v1/notifications').then((res) => setItems(res.data));
    }
  }, [open]);

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md border border-border-hair px-2.5 py-1.5 text-text-muted hover:text-text-primary hover:border-signal-blue transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-signal-red text-[10px] font-semibold text-void">
            {unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-border-hair bg-surface-raised shadow-xl z-20 max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="p-4 text-sm text-text-muted">No notifications yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={async () => {
                  if (!n.readAt) {
                    await api.post(`/v1/notifications/${n.id}/read`);
                    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, readAt: new Date().toISOString() } : i)));
                  }
                }}
                className={`block w-full text-left p-3 border-b border-border-hair last:border-0 hover:bg-surface transition-colors ${
                  n.readAt ? 'opacity-50' : ''
                }`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-text-muted mt-0.5">{n.body}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const NAV_ITEMS = [
  { label: 'Projects', path: (orgId: string) => `/orgs/${orgId}/projects` },
  { label: 'Workers', path: () => '/workers' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, organizations, logout } = useAuth();
  const { orgId } = useParams();
  const navigate = useNavigate();
  const activeOrg = organizations.find((o) => o.id === orgId) ?? organizations[0];

  return (
    <div className="min-h-screen flex bg-void text-text-primary">
      <aside className="w-56 shrink-0 border-r border-border-hair flex flex-col">
        <div className="px-4 py-4 border-b border-border-hair">
          <Link to="/orgs" className="flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 32 32">
              <rect width="32" height="32" rx="7" fill="#12161F" />
              <path
                d="M6 20 L11 20 L13 14 L16 24 L19 11 L21 20 L26 20"
                stroke="#5B8DEF"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-semibold tracking-tight">Forge</span>
          </Link>
        </div>

        {activeOrg && (
          <div className="px-4 py-3 border-b border-border-hair">
            <label className="text-[11px] uppercase tracking-wide text-text-muted">Organization</label>
            <select
              className="mt-1 w-full bg-surface border border-border-hair rounded-md px-2 py-1.5 text-sm"
              value={activeOrg.id}
              onChange={(e) => navigate(`/orgs/${e.target.value}/projects`)}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              to={item.path(activeOrg?.id ?? '')}
              className="block rounded-md px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-surface transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-4 py-3 border-t border-border-hair">
          <p className="text-xs text-text-muted truncate">{user?.email}</p>
          <button onClick={() => logout().then(() => navigate('/login'))} className="mt-1 text-xs text-signal-blue hover:underline">
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border-hair flex items-center justify-between px-6 shrink-0">
          <div className="text-sm text-text-muted mono">{activeOrg?.name ?? ''}</div>
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
