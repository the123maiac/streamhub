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

const SELECT =
  "id, kind, title, thumbnail_path, duration_seconds, view_count, like_count, created_at, owner:profiles!videos_owner_id_fkey(username, display_name, avatar_url)";

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "foryou" } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let videos: FeedRow[] = [];
  let error: string | null = null;

  if (tab === "following" && user) {
    const { data, error: err } = await supabase
      .rpc("following_feed", { p_viewer: user.id, p_limit: 24, p_offset: 0 });
    error = err?.message ?? null;
    const ids = (data ?? []).map((v: { id: string }) => v.id);
    if (ids.length > 0) {
      const { data: full } = await supabase.from("videos").select(SELECT).in("id", ids);
      const byId = new Map(((full as unknown) as FeedRow[] | null)?.map((v) => [v.id, v]) ?? []);
      videos = ids.map((id: string) => byId.get(id)).filter(Boolean) as FeedRow[];
    }
  } else {
    const { data: ranked, error: err } = await supabase
      .rpc("ranked_feed", { p_viewer: user?.id ?? null, p_kind: null, p_limit: 24, p_offset: 0 });
    error = err?.message ?? null;
    const ids = (ranked ?? []).map((r: { video_id: string }) => r.video_id);
    if (ids.length > 0) {
      const { data: full } = await supabase.from("videos").select(SELECT).in("id", ids);
      const byId = new Map(((full as unknown) as FeedRow[] | null)?.map((v) => [v.id, v]) ?? []);
      videos = ids.map((id: string) => byId.get(id)).filter(Boolean) as FeedRow[];
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tab === "following" ? "Following" : "For you"}
        </h1>
        <div className="flex gap-2 text-sm">
          <FeedTab href="/" active={tab === "foryou"}>For you</FeedTab>
          {user && (
            <FeedTab href="/?tab=following" active={tab === "following"}>Following</FeedTab>
          )}
          <Link href="/shorts" className="rounded-md px-3 py-1.5 text-fg-muted hover:bg-bg-muted">Shorts</Link>
          <Link href="/live" className="rounded-md px-3 py-1.5 text-fg-muted hover:bg-bg-muted">Live</Link>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-400">Couldn&apos;t load feed: {error}</p>
      ) : videos.length === 0 ? (
        <EmptyState tab={tab} signedIn={Boolean(user)} />
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

function FeedTab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 ${active ? "bg-bg-muted text-fg" : "text-fg-muted hover:bg-bg-muted"}`}
    >
      {children}
    </Link>
  );
}

function EmptyState({ tab, signedIn }: { tab: string; signedIn: boolean }) {
  if (tab === "following") {
    return (
      <div className="rounded-xl border border-border bg-bg-muted p-10 text-center">
        <h2 className="text-lg font-medium">Nothing from your follows yet</h2>
        <p className="mt-2 text-sm text-fg-muted">
          Follow some creators, or switch to the For You feed.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-bg-muted p-10 text-center">
      <h2 className="text-lg font-medium">No videos yet</h2>
      <p className="mt-2 text-sm text-fg-muted">
        Be the first to post something.
      </p>
      {signedIn && (
        <Link
          href="/upload"
          className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          Upload a video
        </Link>
      )}
    </div>
  );
}
