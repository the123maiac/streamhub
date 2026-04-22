import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

type Props = {
  profile: { username: string; display_name: string; avatar_url: string | null } | null;
};

export function TopNav({ profile }: Props) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          StreamHub
        </Link>
        <nav className="flex items-center gap-4 text-sm text-fg-muted">
          <Link href="/shorts" className="hover:text-fg">Shorts</Link>
          <Link href="/live" className="hover:text-fg">Live</Link>
          <Link href="/music" className="hover:text-fg">Music</Link>
          <Link href="/search" className="hover:text-fg">Search</Link>
          {profile ? (
            <>
              <Link href="/messages" className="hover:text-fg">Messages</Link>
              <Link href="/go-live" className="hover:text-fg">Go live</Link>
              <Link href="/upload" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90">
                Upload
              </Link>
              <Link href={`/u/${profile.username}`} className="hover:text-fg">
                @{profile.username}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-fg">Log in</Link>
              <Link href="/signup" className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-fg hover:opacity-90">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
