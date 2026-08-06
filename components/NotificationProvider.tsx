"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type NotificationVariant = "default" | "destructive" | "warning";

export interface AppNotification {
  id: string;
  title: string;
  detail: string;
  variant: NotificationVariant;
  ts: number;
  read: boolean;
}

const STORAGE_KEY = "adicc.notifications.v1";

const SEED: AppNotification[] = [
  {
    id: "seed_takeoff",
    title: "Takeoff completed",
    detail: "Al Barsha Villa — 12 elements parsed successfully.",
    variant: "default",
    ts: Date.now() - 3600_000,
    read: true,
  },
  {
    id: "seed_contract",
    title: "High risk alert",
    detail: "3 indemnity clauses flagged in contract review.",
    variant: "destructive",
    ts: Date.now() - 7200_000,
    read: true,
  },
  {
    id: "seed_schedule",
    title: "Schedule update",
    detail: "Marina Tower P2 — +23 day delay forecast.",
    variant: "warning",
    ts: Date.now() - 8640_000,
    read: true,
  },
];

function loadNotifications(): AppNotification[] {
  if (typeof window === "undefined") return SEED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as AppNotification[]) : SEED;
  } catch {
    return SEED;
  }
}

function persist(list: AppNotification[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  push: (n: Omit<AppNotification, "id" | "ts" | "read"> & { id?: string }) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setNotifications(loadNotifications());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    persist(notifications);
  }, [notifications, ready]);

  const push = useCallback<NotificationContextValue["push"]>((n) => {
    const item: AppNotification = {
      id: n.id ?? `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      title: n.title,
      detail: n.detail,
      variant: n.variant,
      ts: Date.now(),
      read: false,
    };
    setNotifications((prev) => [item, ...prev].slice(0, 50));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, push, markAllRead, markRead }}>
      {ready ? children : null}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
