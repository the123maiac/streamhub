import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideoCard } from "@/components/VideoCard";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio")
    .eq("username", username)
    .maybeSingle();
  if (!profile) notFound();

  const { data: videoRows } = await supabase
    .from("videos")
    .select("id, kind, title, thumbnail_path, duration_seconds, view_count, like_count, created_at")
    .eq("owner_id", profile.id)
    .eq("visibility", "public")
    .eq("is_removed", false)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(48);

  const videos = (videoRows ?? []).map((v) => ({
    ...v,
    owner: { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
  }));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-bg-muted" />
        <div>
          <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
          <p className="text-sm text-fg-muted">@{profile.username}</p>
          {profile.bio && <p className="mt-2 max-w-prose text-sm">{profile.bio}</p>}
        </div>
      </header>
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Videos</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing here yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
