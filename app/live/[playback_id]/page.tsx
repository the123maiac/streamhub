import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { playbackUrl } from "@/lib/livepeer/client";
import { LiveView } from "@/components/LiveView";
import { LiveChat } from "@/components/LiveChat";

export default async function LivePage({ params }: { params: Promise<{ playback_id: string }> }) {
  const { playback_id } = await params;
  const supabase = await createClient();
  const { data: stream } = await supabase
    .from("streams")
    .select("id, title, description, category, status, playback_id, started_at, owner:profiles!streams_owner_id_fkey(id, username, display_name)")
    .eq("playback_id", playback_id)
    .maybeSingle();
  if (!stream || !stream.playback_id) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let viewerUsername: string | null = null;
  if (user) {
    const { data: me } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    viewerUsername = me?.username ?? null;
  }

  const owner = Array.isArray(stream.owner) ? stream.owner[0] : (stream.owner as unknown as { id: string; username: string; display_name: string });
  const hlsUrl = playbackUrl(stream.playback_id);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <LiveView hlsUrl={hlsUrl} status={stream.status as "idle" | "live" | "ended"} />
        <div>
          <h1 className="text-xl font-semibold">{stream.title}</h1>
          <p className="text-sm text-fg-muted">
            <Link href={`/u/${owner.username}`} className="hover:text-fg">@{owner.username}</Link>
            {stream.category && <> · {stream.category}</>}
          </p>
          {stream.description && <p className="mt-2 whitespace-pre-wrap text-sm">{stream.description}</p>}
        </div>
      </div>
      <aside className="flex h-[80vh] flex-col overflow-hidden rounded-xl border border-border bg-bg-muted">
        <div className="border-b border-border px-4 py-2 text-sm font-semibold">Live chat</div>
        <LiveChat streamId={stream.id} signedIn={Boolean(user)} username={viewerUsername} />
      </aside>
    </div>
  );
}
