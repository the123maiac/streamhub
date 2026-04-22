import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-3 py-16 text-center">
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="text-sm text-fg-muted">That page doesn&apos;t exist (or it does, and you can&apos;t see it).</p>
      <Link href="/" className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
        Back home
      </Link>
    </div>
  );
}
