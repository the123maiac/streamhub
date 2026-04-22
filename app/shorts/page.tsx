import { createClient } from "@/lib/supabase/server";
import { VideoCard } from "@/components/VideoCard";

export const revalidate = 30;

export default async function ShortsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("videos")
    .select(
      "id, kind, title, thumbnail_path, duration_seconds, view_count, like_count, created_at, owner:profiles!videos_owner_id_fkey(username, display_name, avatar_url)"
    )
    .eq("kind", "short")
    .eq("visibility", "public")
    .eq("is_removed", false)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(48);

  const videos = ((data as unknown) as Parameters<typeof VideoCard>[0]["video"][]) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Shorts</h1>
      {videos.length === 0 ? (
        <p className="text-sm text-fg-muted">No shorts yet — be the first to post one.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      )}
    </div>
  );
}
