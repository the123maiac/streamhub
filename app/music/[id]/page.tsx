import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { audioPublicUrl } from "@/lib/storage";

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: track } = await supabase
    .from("audio_tracks")
    .select("id, title, duration_seconds, use_count, file_path, source, owner:profiles!audio_tracks_owner_id_fkey(username, display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!track) notFound();

  const owner = Array.isArray(track.owner) ? track.owner[0] : (track.owner as { username: string; display_name: string } | null);
  const url = audioPublicUrl(track.file_path);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/music" className="text-xs text-fg-muted hover:text-fg">← All tracks</Link>
      <h1 className="text-2xl font-semibold">{track.title}</h1>
      <p className="text-sm text-fg-muted">
        {owner?.username ? <>by @{owner.username} · </> : null}
        {track.use_count} uses · {track.duration_seconds ? `${Math.round(Number(track.duration_seconds))}s` : "—"}
      </p>
      <audio controls src={url} className="w-full" />
      <Link
        href={`/upload?audio=${track.id}`}
        className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
      >
        Use this sound in a video
      </Link>
    </div>
  );
}
