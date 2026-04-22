"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/format";

type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: { username: string; display_name: string; avatar_url: string | null };
};

export function CommentSection({ videoId, currentUserId }: { videoId: string; currentUserId: string | null }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("video_comments")
      .select("id, body, created_at, author:profiles!video_comments_author_id_fkey(username, display_name, avatar_url)")
      .eq("video_id", videoId)
      .eq("is_removed", false)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setComments(data as unknown as Comment[]);
      });
  }, [videoId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("video_comments")
      .insert({ video_id: videoId, author_id: currentUserId!, body: draft.trim() })
      .select("id, body, created_at, author:profiles!video_comments_author_id_fkey(username, display_name, avatar_url)")
      .single();
    setBusy(false);
    if (error || !data) {
      setError(error?.message ?? "Could not post comment");
      return;
    }
    setComments((c) => [data as unknown as Comment, ...c]);
    setDraft("");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold">Comments</h2>
      {currentUserId ? (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a comment…"
            maxLength={2000}
            className="flex-1 rounded-md border border-border bg-bg-muted px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            Post
          </button>
        </form>
      ) : (
        <p className="text-sm text-fg-muted">
          <Link href="/login" className="text-fg underline">Log in</Link> to comment.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="rounded-lg bg-bg-muted p-3 text-sm">
            <div className="mb-1 flex items-center justify-between text-xs text-fg-muted">
              <Link href={`/u/${c.author.username}`} className="hover:text-fg">@{c.author.username}</Link>
              <span>{timeAgo(c.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
