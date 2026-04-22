import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function MusicPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tracks } = await supabase
    .from("audio_tracks")
    .select("id, title, duration_seconds, use_count, source, owner:profiles!audio_tracks_owner_id_fkey(username, display_name)")
    .eq("is_reusable", true)
    .order("use_count", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Music library</h1>
          <p className="text-sm text-fg-muted">Reusable audio tracks — tap to preview or use in a video.</p>
        </div>
        {user && (
          <Link href="/music/upload" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg">
            Upload track
          </Link>
        )}
      </div>

      {(tracks ?? []).length === 0 ? (
        <p className="text-sm text-fg-muted">No tracks yet. Upload one to get started.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-bg-muted">
          {(tracks ?? []).map((t) => {
            const owner = Array.isArray(t.owner) ? t.owner[0] : t.owner;
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 p-3">
                <Link href={`/music/${t.id}`} className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.title}</div>
                  <div className="truncate text-xs text-fg-muted">
                    @{(owner as { username?: string } | null)?.username ?? "platform"} ·
                    {" "}{t.duration_seconds ? `${Math.round(Number(t.duration_seconds))}s` : "—"}
                    {" · "}{t.use_count} uses
                  </div>
                </Link>
                <Link
                  href={`/upload?audio=${t.id}`}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-bg-elevated"
                >
                  Use this sound
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
