"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCount } from "@/lib/format";

type Props = {
  videoId: string;
  initialLiked: boolean;
  initialCount: number;
};

export function LikeButton({ videoId, initialLiked, initialCount }: Props) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push(`/login?next=/watch/${videoId}`);
      return;
    }
    if (liked) {
      await supabase.from("video_likes").delete().eq("user_id", user.id).eq("video_id", videoId);
      setLiked(false);
      setCount((c) => Math.max(0, c - 1));
    } else {
      await supabase.from("video_likes").insert({ user_id: user.id, video_id: videoId });
      setLiked(true);
      setCount((c) => c + 1);
    }
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full border border-border px-4 py-1.5 text-sm transition ${
        liked ? "bg-accent text-accent-fg" : "bg-bg-muted hover:bg-bg-elevated"
      }`}
    >
      {liked ? "♥" : "♡"} {formatCount(count)}
    </button>
  );
}
