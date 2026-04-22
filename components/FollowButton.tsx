"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  targetUserId: string;
  isSelf: boolean;
  initialFollowing: boolean;
  signedIn: boolean;
};

export function FollowButton({ targetUserId, isSelf, initialFollowing, signedIn }: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);

  if (isSelf) return null;

  async function toggle() {
    if (!signedIn) {
      router.push(`/login`);
      return;
    }
    setBusy(true);
    const method = following ? "DELETE" : "POST";
    const res = await fetch("/api/follows", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    setBusy(false);
    if (res.ok) {
      setFollowing(!following);
      router.refresh();
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
        following
          ? "border border-border bg-bg-muted text-fg hover:bg-bg-elevated"
          : "bg-accent text-accent-fg hover:opacity-90"
      } disabled:opacity-60`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
