import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MessageThread } from "@/components/MessageThread";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/messages/${id}`);

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind, title, members:conversation_members(user_id, profiles(username, display_name))")
    .eq("id", id)
    .maybeSingle();
  if (!conv) notFound();

  type MemberProfile = { username: string; display_name: string } | null;
  const rawMembers = (conv.members ?? []) as { user_id: string; profiles: MemberProfile | MemberProfile[] }[];
  const members = rawMembers.map((m) => ({
    user_id: m.user_id,
    profile: Array.isArray(m.profiles) ? m.profiles[0] ?? null : m.profiles,
  }));
  const mine = members.find((m) => m.user_id === user.id);
  if (!mine) notFound();

  const others = members.filter((m) => m.user_id !== user.id).map((m) => m.profile).filter(Boolean) as { username: string; display_name: string }[];
  const label =
    conv.kind === "dm"
      ? others[0]?.display_name ?? others[0]?.username ?? "Unknown"
      : conv.title || others.map((o) => o.username).slice(0, 3).join(", ") || "Group chat";

  const { data: me } = await supabase.from("profiles").select("username, display_name").eq("id", user.id).maybeSingle();

  const { data: initialMessages } = await supabase
    .from("messages")
    .select("id, author_id, body, created_at, profiles:author_id(username, display_name)")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(100);

  await supabase.rpc("mark_conversation_read", { p_conversation_id: id });

  return (
    <div className="mx-auto flex h-[80vh] max-w-2xl flex-col rounded-xl border border-border bg-bg-muted">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <Link href="/messages" className="text-xs text-fg-muted hover:text-fg">← All messages</Link>
          <h1 className="text-lg font-semibold">{label}</h1>
        </div>
        <span className="text-xs uppercase tracking-wide text-fg-muted">{conv.kind}</span>
      </div>
      <MessageThread
        conversationId={id}
        kind={conv.kind as "dm" | "group"}
        selfId={user.id}
        selfUsername={me?.username ?? "me"}
        initial={(initialMessages ?? []).map((m) => {
          const prof = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return {
            id: m.id,
            authorId: m.author_id,
            body: m.body ?? "",
            ts: new Date(m.created_at).getTime(),
            username: (prof as { username?: string } | null)?.username ?? "user",
          };
        })}
      />
    </div>
  );
}
