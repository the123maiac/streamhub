import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { timeAgo } from "@/lib/format";

export const revalidate = 10;

type LiveStream = {
  id: string;
  playback_id: string | null;
  title: string;
  category: string | null;
  started_at: string | null;
  owner: { username: string; display_name: string };
};

export default async function LivePage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("streams")
    .select("id, playback_id, title, category, started_at, owner:profiles!streams_owner_id_fkey(username, display_name)")
    .eq("status", "live")
    .order("started_at", { ascending: false })
    .limit(24);

  const streams = ((data as unknown) as LiveStream[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Live now</h1>
        <Link href="/go-live" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">
          Go live
        </Link>
      </div>
      {streams.length === 0 ? (
        <p className="text-sm text-fg-muted">Nobody&apos;s live right now. Go be the first.</p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {streams.map((s) => (
            <Link
              key={s.id}
              href={`/live/${s.playback_id}`}
              className="rounded-xl bg-bg-muted p-3 transition hover:bg-bg-elevated"
            >
              <div className="flex aspect-video items-center justify-center rounded-lg bg-black">
                <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">LIVE</span>
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-medium">{s.title}</h3>
              <div className="mt-1 flex justify-between text-xs text-fg-muted">
                <span>@{s.owner.username}</span>
                {s.started_at && <span>started {timeAgo(s.started_at)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
