import { createClient } from "@/lib/supabase/server";
import { VideoCard } from "@/components/VideoCard";
import Link from "next/link";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const supabase = await createClient();

  let videoRows: unknown[] = [];
  let userRows: { username: string; display_name: string }[] = [];

  if (q.trim()) {
    const tsq = q.trim().split(/\s+/).map((t) => `${t}:*`).join(" & ");
    const { data: vids } = await supabase
      .from("videos")
      .select(
        "id, kind, title, thumbnail_path, duration_seconds, view_count, like_count, created_at, owner:profiles!videos_owner_id_fkey(username, display_name, avatar_url)"
      )
      .textSearch("search_tsv", tsq, { config: "simple" })
      .eq("visibility", "public")
      .eq("is_removed", false)
      .eq("status", "ready")
      .limit(24);
    videoRows = vids ?? [];

    const { data: users } = await supabase
      .from("profiles")
      .select("username, display_name")
      .ilike("username", `%${q}%`)
      .limit(12);
    userRows = users ?? [];
  }

  return (
    <div className="space-y-6">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search videos, users…"
          className="flex-1 rounded-md border border-border bg-bg-muted px-3 py-2"
        />
        <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">Search</button>
      </form>

      {q && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">People</h2>
            {userRows.length === 0 ? (
              <p className="text-sm text-fg-muted">No matching users.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {userRows.map((u) => (
                  <li key={u.username}>
                    <Link href={`/u/${u.username}`} className="hover:underline">
                      @{u.username} — {u.display_name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Videos</h2>
            {videoRows.length === 0 ? (
              <p className="text-sm text-fg-muted">No matching videos.</p>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {(videoRows as Parameters<typeof VideoCard>[0]["video"][]).map((v) => (
                  <VideoCard key={v.id} video={v} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
