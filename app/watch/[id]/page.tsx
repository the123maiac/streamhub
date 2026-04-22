import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import { formatCount, timeAgo } from "@/lib/format";
import { VideoPlayer } from "@/components/VideoPlayer";
import { CommentSection } from "@/components/CommentSection";
import { LikeButton } from "@/components/LikeButton";
import { RecordView } from "@/components/RecordView";

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select(
      "id, kind, title, description, status, hls_manifest_path, mp4_path, thumbnail_path, duration_seconds, view_count, like_count, created_at, owner:profiles!videos_owner_id_fkey(id, username, display_name, avatar_url)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!video) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let liked = false;
  if (user) {
    const { data } = await supabase
      .from("video_likes")
      .select("user_id")
      .eq("user_id", user.id)
      .eq("video_id", video.id)
      .maybeSingle();
    liked = Boolean(data);
  }

  const owner = Array.isArray(video.owner) ? video.owner[0] : (video.owner as unknown as { id: string; username: string; display_name: string; avatar_url: string | null });
  const hlsUrl = video.hls_manifest_path ? publicUrl("hls", video.hls_manifest_path) : null;
  const mp4Url = video.mp4_path ? publicUrl("hls", video.mp4_path) : null;
  const poster = video.thumbnail_path ? publicUrl("thumbnails", video.thumbnail_path) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        {video.status !== "ready" ? (
          <div className="flex aspect-video items-center justify-center rounded-xl bg-bg-muted text-sm text-fg-muted">
            {video.status === "failed" ? "Processing failed." : "Processing — check back in a minute."}
          </div>
        ) : hlsUrl || mp4Url ? (
          <>
            <VideoPlayer hlsUrl={hlsUrl} mp4Url={mp4Url} poster={poster} />
            <RecordView videoId={video.id} />
          </>
        ) : null}

        <h1 className="text-xl font-semibold">{video.title}</h1>
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <Link href={`/u/${owner.username}`} className="flex items-center gap-2">
            <span>@{owner.username}</span>
          </Link>
          <span>
            {formatCount(video.view_count)} views · {timeAgo(video.created_at)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <LikeButton videoId={video.id} initialLiked={liked} initialCount={video.like_count} />
        </div>
        {video.description && (
          <p className="whitespace-pre-wrap rounded-lg bg-bg-muted p-4 text-sm">{video.description}</p>
        )}
        <CommentSection videoId={video.id} currentUserId={user?.id ?? null} />
      </div>
      <aside className="space-y-3">
        <h2 className="text-sm font-semibold text-fg-muted">More to watch</h2>
        <p className="text-xs text-fg-muted">Recommendations land in Phase 2.</p>
      </aside>
    </div>
  );
}
