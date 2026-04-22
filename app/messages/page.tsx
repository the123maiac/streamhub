import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";

type MemberRow = { user_id: string; profiles: { username: string; display_name: string; avatar_url: string | null } | null };
type ConversationRow = {
  id: string;
  kind: "dm" | "group";
  title: string | null;
  updated_at: string;
  members: MemberRow[];
  messages: { body: string | null; created_at: string }[];
};

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/messages");

  const { data: rows } = await supabase
    .from("conversations")
    .select(
      "id, kind, title, updated_at, members:conversation_members(user_id, profiles(username, display_name, avatar_url)), messages(body, created_at)"
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  const conversations = ((rows ?? []) as unknown as ConversationRow[]).map((c) => {
    const others = (c.members ?? []).filter((m) => m.user_id !== user.id).map((m) => m.profiles).filter(Boolean);
    const last = (c.messages ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    const label =
      c.kind === "dm"
        ? others[0]?.display_name ?? others[0]?.username ?? "Unknown"
        : c.title || others.map((o) => o!.username).slice(0, 3).join(", ") || "Group chat";
    return { id: c.id, kind: c.kind, label, lastBody: last?.body ?? "", lastAt: last?.created_at ?? c.updated_at };
  });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <Link href="/messages/new" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">
          New
        </Link>
      </div>
      {conversations.length === 0 ? (
        <p className="text-sm text-fg-muted">No conversations yet. Start one by clicking New.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-bg-muted">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/messages/${c.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-bg-elevated">
                <div className="min-w-0">
                  <div className="truncate font-medium">{c.label}</div>
                  <div className="truncate text-xs text-fg-muted">{c.lastBody || "No messages yet"}</div>
                </div>
                <div className="shrink-0 text-xs text-fg-muted">{timeAgo(c.lastAt)}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
