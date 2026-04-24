import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VideoEditor, type EditorClip, type EditorTrack } from "@/components/VideoEditor";
import { publicUrl } from "@/lib/storage";

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ clip?: string; audio?: string }> }) {
  const { clip: initialClipId, audio: initialAudioId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/studio");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, kind, duration_seconds, mp4_path, thumbnail_path")
    .eq("owner_id", user.id)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: tracks } = await supabase
    .from("audio_tracks")
    .select("id, title, duration_seconds, file_path")
    .eq("is_reusable", true)
    .order("use_count", { ascending: false })
    .limit(100);

  const editorVideos: EditorClip[] = (videos ?? [])
    .filter((v) => v.mp4_path)
    .map((v) => ({
      id: v.id,
      title: v.title,
      kind: v.kind as "short" | "long",
      duration: Number(v.duration_seconds ?? 0),
      previewUrl: publicUrl("hls", v.mp4_path!),
      thumbUrl: v.thumbnail_path ? publicUrl("thumbnails", v.thumbnail_path) : null,
    }));

  const editorTracks: EditorTrack[] = (tracks ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    duration: Number(t.duration_seconds ?? 0),
    previewUrl: publicUrl("audio", t.file_path),
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <p className="text-sm text-fg-muted">
        Trim clips, stitch them together, overlay text, and drop in a music bed. Saving creates a new video on your profile.
      </p>
      {editorVideos.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-muted p-6 text-sm text-fg-muted">
          You need at least one processed video to use the editor. <a href="/upload" className="text-accent underline">Upload one.</a>
        </div>
      ) : (
        <VideoEditor
          videos={editorVideos}
          tracks={editorTracks}
          initialClipId={initialClipId}
          initialAudioId={initialAudioId}
        />
      )}
    </div>
  );
}
