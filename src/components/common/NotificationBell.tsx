"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BusFront, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, EmptyState, Sheet, cn } from "@/components/ui";

/**
 * Header bell: unread count + inbox sheet, fed by GET /api/notifications.
 * Polls every 60 s while the tab is visible and refreshes when the tab comes back,
 * matching the app's "poll while visible" approach (no Realtime with our custom auth).
 */
type Item = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string | null;
};

const POLL_MS = 60_000;

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function iconFor(type: string | null) {
  if (type === "SEAT_RELEASED" || type === "SOS") return <AlertTriangle className="w-4 h-4 text-rose-500" />;
  if (type === "SEAT_CONFIRM") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
  if (type === "CHART_READY") return <BusFront className="w-4 h-4 text-blue-600" />;
  return <CheckCircle2 className="w-4 h-4 text-gray-400" />;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/notifications", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = await res.json();
      setItems(body.items || []);
      setUnread(body.unread || 0);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      busy.current = false;
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const mark = async (body: { ids: string[] } | { all: true }) => {
    const ids = "all" in body ? null : new Set(body.ids);
    setItems((prev) => prev.map((n) => (!ids || ids.has(n.id) ? { ...n, isRead: true } : n)));
    setUnread((u) => (ids ? Math.max(0, u - items.filter((n) => ids.has(n.id) && !n.isRead).length) : 0));
    await fetch("/api/notifications", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  };

  const openItem = (n: Item) => {
    if (!n.isRead) void mark({ ids: [n.id] });
    if (n.url && n.url.startsWith("/") && !n.url.startsWith("//")) {
      setOpen(false);
      router.push(n.url);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          void load();
        }}
        className="relative p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        title="Notifications"
      >
        <Bell className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-black leading-4 text-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Notifications"
        footer={
          unread > 0 ? (
            <Button variant="secondary" block onClick={() => void mark({ all: true })}>
              Mark all as read
            </Button>
          ) : undefined
        }
      >
        {!loaded ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : failed && items.length === 0 ? (
          <EmptyState title="Couldn't load notifications">Check your connection and open this again.</EmptyState>
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell className="w-5 h-5" />} title="No notifications yet">
            You'll see your bus updates here, like when the boarding chart is ready.
          </EmptyState>
        ) : (
          <ul className="-mx-2 space-y-1">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "w-full text-left flex gap-3 p-3 rounded-2xl transition-colors hover:bg-gray-50 dark:hover:bg-zinc-900",
                    !n.isRead && "bg-blue-50/70 dark:bg-blue-950/30"
                  )}
                >
                  <span className="mt-0.5 shrink-0">{iconFor(n.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className={cn("text-sm min-w-0", n.isRead ? "font-semibold text-gray-700 dark:text-gray-300" : "font-black text-gray-900 dark:text-white")}>
                        {n.title}
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(n.createdAt)}</span>
                    </span>
                    {n.message && <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5 break-words">{n.message}</span>}
                  </span>
                  {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-600 shrink-0" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </>
  );
}
