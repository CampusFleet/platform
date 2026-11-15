import { db } from "@/lib/supabaseClient";

/**
 * In-app notification inbox. Server-only.
 *
 * Rows are addressed to users.id (foreign key fk_notifications_users), taken from the session.
 */
export type InboxItem = {
  id: string;
  title: string;
  message: string;
  type: string | null;
  url: string | null;
  isRead: boolean;
  createdAt: string | null;
};

const LIMIT = 30;

export async function listInbox(userId: string): Promise<{ items: InboxItem[]; unread: number }> {
  const query = (cols: string) =>
    db.from("notifications").select(cols).eq("user_id", userId).order("created_at", { ascending: false }).limit(LIMIT);
  const [first, count] = await Promise.all([
    query("id, title, message, type, url, is_read, created_at"),
    db.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("is_read", false),
  ]);
  // notifications.url arrives with migration 20261117; until then read without it.
  const list = first.error?.code === "42703" ? await query("id, title, message, type, is_read, created_at") : first;
  if (list.error) throw new Error(list.error.message);
  const rows = (list.data || []) as unknown as {
    id: string; title: string | null; message: string | null; type: string | null; url?: string | null; is_read: boolean | null; created_at: string | null;
  }[];
  const items = rows.map((n) => ({
    id: n.id,
    title: n.title || "Notification",
    message: n.message || "",
    type: n.type,
    url: n.url ?? null,
    isRead: Boolean(n.is_read),
    createdAt: n.created_at,
  }));
  return { items, unread: count.count ?? items.filter((i) => !i.isRead).length };
}

/** Mark the given notifications (or all) as read. Only the caller's own rows are touched. */
export async function markRead(userId: string, ids: string[] | "all"): Promise<void> {
  let q = db.from("notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  if (ids !== "all") {
    if (ids.length === 0) return;
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) throw new Error(error.message);
}
