import Link from "next/link";
import Image from "next/image";
import { publicUrl } from "@/lib/storage";
import { formatDuration, formatCount, timeAgo } from "@/lib/format";

type Video = {
  id: string;
  kind: "short" | "long";
  title: string;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  view_count: number;
  like_count: number;
  created_at: string;
  owner: { username: string; display_name: string; avatar_url: string | null };
};

export function VideoCard({ video }: { video: Video }) {
  const href = video.kind === "short" ? `/s/${video.id}` : `/watch/${video.id}`;
  const thumb = video.thumbnail_path ? publicUrl("thumbnails", video.thumbnail_path) : null;

  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 rounded-xl bg-bg-muted p-2 transition hover:bg-bg-elevated"
    >
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        {thumb ? (
          <Image
            src={thumb}
            alt={video.title}
            fill
            className="object-cover transition group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-fg-muted">
            No thumbnail
          </div>
        )}
        {video.duration_seconds ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-xs">
            {formatDuration(video.duration_seconds)}
          </span>
        ) : null}
        {video.kind === "short" ? (
          <span className="absolute top-1 left-1 rounded bg-accent/90 px-1.5 py-0.5 text-xs font-medium text-accent-fg">
            Short
          </span>
        ) : null}
      </div>
      <div className="px-1">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{video.title}</h3>
        <div className="mt-1 flex items-center justify-between text-xs text-fg-muted">
          <span>@{video.owner.username}</span>
          <span>
            {formatCount(video.view_count)} views · {timeAgo(video.created_at)}
          </span>
        </div>
      </div>
    </Link>
  );
}
