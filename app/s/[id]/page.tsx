import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import { formatCount, timeAgo } from "@/lib/format";
import { VideoPlayer } from "@/components/VideoPlayer";
import { CommentSection } from "@/components/CommentSection";
import { LikeButton } from "@/components/LikeButton";
import { RecordView } from "@/components/RecordView";

export default async function ShortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select(
      "id, kind, title, description, status, hls_manifest_path, mp4_path, thumbnail_path, view_count, like_count, created_at, owner:profiles!videos_owner_id_fkey(id, username, display_name)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!video) notFound();
  const owner = Array.isArray(video.owner) ? video.owner[0] : (video.owner as unknown as { id: string; username: string; display_name: string });
  const hlsUrl = video.hls_manifest_path ? publicUrl("hls", video.hls_manifest_path) : null;
  const mp4Url = video.mp4_path ? publicUrl("hls", video.mp4_path) : null;
  const poster = video.thumbnail_path ? publicUrl("thumbnails", video.thumbnail_path) : undefined;

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

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[auto_1fr]">
      <div className="flex justify-center">
        <div className="w-[min(100%,360px)]">
          {video.status !== "ready" ? (
            <div className="flex aspect-[9/16] items-center justify-center rounded-xl bg-bg-muted text-sm text-fg-muted">
              {video.status === "failed" ? "Processing failed." : "Processing…"}
            </div>
          ) : (
            <>
              <div className="aspect-[9/16] overflow-hidden rounded-xl bg-black">
                <VideoPlayer hlsUrl={hlsUrl} mp4Url={mp4Url} poster={poster} />
              </div>
              <RecordView videoId={video.id} />
            </>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">{video.title}</h1>
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <Link href={`/u/${owner.username}`}>@{owner.username}</Link>
          <span>{formatCount(video.view_count)} views · {timeAgo(video.created_at)}</span>
        </div>
        <LikeButton videoId={video.id} initialLiked={liked} initialCount={video.like_count} />
        {video.description && (
          <p className="whitespace-pre-wrap rounded-lg bg-bg-muted p-3 text-sm">{video.description}</p>
        )}
        <CommentSection videoId={video.id} currentUserId={user?.id ?? null} />
      </div>
    </div>
  );
}
