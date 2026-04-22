import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { VideoCard } from "@/components/VideoCard";

export const revalidate = 60;

type FeedRow = {
  id: string;
  kind: "short" | "long";
  title: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  view_count: number;
  like_count: number;
  created_at: string;
  owner: { username: string; display_name: string; avatar_url: string | null };
};

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("videos")
    .select(
      "id, kind, title, thumbnail_path, duration_seconds, view_count, like_count, created_at, owner:profiles!videos_owner_id_fkey(username, display_name, avatar_url)"
    )
    .eq("visibility", "public")
    .eq("is_removed", false)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(24);

  const videos = ((data as unknown) as FeedRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Latest</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/" className="rounded-md bg-bg-muted px-3 py-1.5">Home</Link>
          <Link href="/shorts" className="rounded-md px-3 py-1.5 text-fg-muted hover:bg-bg-muted">Shorts</Link>
          <Link href="/live" className="rounded-md px-3 py-1.5 text-fg-muted hover:bg-bg-muted">Live</Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400">Couldn&apos;t load feed: {error.message}</p>
      ) : videos.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-border bg-bg-muted p-10 text-center">
      <h2 className="text-lg font-medium">No videos yet</h2>
      <p className="mt-2 text-sm text-fg-muted">
        Be the first to post something. Sign in and upload a clip to kick things off.
      </p>
      <Link
        href="/upload"
        className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        Upload a video
      </Link>
    </div>
  );
}
