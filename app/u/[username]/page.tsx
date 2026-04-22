import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { publicUrl } from "@/lib/storage";
import { VideoCard } from "@/components/VideoCard";
import { FollowButton } from "@/components/FollowButton";
import { formatCount } from "@/lib/format";

export default async function ProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, follower_count, following_count, video_count")
    .eq("username", username)
    .maybeSingle();
  if (!profile) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let following = false;
  if (user && user.id !== profile.id) {
    const { data } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("followee_id", profile.id)
      .maybeSingle();
    following = Boolean(data);
  }

  const { data: videoRows } = await supabase
    .from("videos")
    .select("id, kind, title, thumbnail_path, duration_seconds, view_count, like_count, created_at")
    .eq("owner_id", profile.id)
    .eq("visibility", "public")
    .eq("is_removed", false)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(48);

  const videos = (videoRows ?? []).map((v) => ({
    ...v,
    owner: { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url },
  }));

  const avatar = profile.avatar_url ? publicUrl("avatars", profile.avatar_url) : null;
  const isSelf = user?.id === profile.id;

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative h-24 w-24 overflow-hidden rounded-full bg-bg-muted">
          {avatar && <Image src={avatar} alt="" fill className="object-cover" />}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
            <FollowButton
              targetUserId={profile.id}
              isSelf={isSelf}
              initialFollowing={following}
              signedIn={Boolean(user)}
            />
            {isSelf && (
              <Link
                href="/settings/profile"
                className="rounded-full border border-border bg-bg-muted px-4 py-1.5 text-sm"
              >
                Edit profile
              </Link>
            )}
          </div>
          <p className="text-sm text-fg-muted">@{profile.username}</p>
          <div className="mt-2 flex gap-5 text-sm text-fg-muted">
            <span><strong className="text-fg">{formatCount(profile.video_count)}</strong> videos</span>
            <span><strong className="text-fg">{formatCount(profile.follower_count)}</strong> followers</span>
            <span><strong className="text-fg">{formatCount(profile.following_count)}</strong> following</span>
          </div>
          {profile.bio && <p className="mt-3 max-w-prose whitespace-pre-wrap text-sm">{profile.bio}</p>}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-fg-muted">Videos</h2>
        {videos.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing here yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((v) => (
              <VideoCard key={v.id} video={v} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
