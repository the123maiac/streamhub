import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { EditForm } from "@/components/EditForm";

export default async function EditPage({ params }: { params: Promise<{ video_id: string }> }) {
  const { video_id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/edit/${video_id}`);

  const { data: video } = await supabase
    .from("videos")
    .select("id, owner_id, title, duration_seconds, kind, status")
    .eq("id", video_id)
    .maybeSingle();
  if (!video) notFound();
  if (video.owner_id !== user.id) redirect(`/watch/${video_id}`);

  const { data: tracks } = await supabase
    .from("audio_tracks")
    .select("id, title, duration_seconds")
    .eq("is_reusable", true)
    .order("use_count", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={video.kind === "short" ? `/s/${video_id}` : `/watch/${video_id}`} className="text-xs text-fg-muted hover:text-fg">
        ← Back to video
      </Link>
      <h1 className="text-2xl font-semibold">Edit: {video.title}</h1>
      <p className="text-sm text-fg-muted">
        Queues a re-render on the server. The existing video stays live until the new render replaces it.
      </p>
      <EditForm
        videoId={video.id}
        duration={Number(video.duration_seconds ?? 0)}
        tracks={(tracks ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          duration: Number(t.duration_seconds ?? 0),
        }))}
      />
    </div>
  );
}
