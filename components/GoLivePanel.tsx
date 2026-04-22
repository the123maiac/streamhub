"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Existing = {
  id: string;
  playback_id: string | null;
  stream_key: string | null;
  title: string;
  status: "idle" | "live" | "ended";
  started_at: string | null;
} | null;

const RTMP_INGEST = "rtmp://rtmp.livepeer.com/live";

export function GoLivePanel({ existing }: { existing: Existing }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  async function createStream(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/streams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "failed" }));
      setError(j.error ?? "Couldn't create stream");
      return;
    }
    router.refresh();
  }

  if (existing) {
    return (
      <div className="space-y-3 rounded-xl border border-border bg-bg-muted p-5 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">{existing.title}</h2>
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
            existing.status === "live" ? "bg-red-500 text-white" : "bg-bg-elevated text-fg-muted"
          }`}>
            {existing.status === "live" ? "LIVE" : "idle"}
          </span>
        </div>
        <Field label="RTMP server" value={RTMP_INGEST} />
        <Field
          label="Stream key"
          value={showKey ? existing.stream_key ?? "" : "•".repeat(24)}
          trailing={
            <button type="button" onClick={() => setShowKey((s) => !s)} className="text-xs text-accent">
              {showKey ? "Hide" : "Show"}
            </button>
          }
        />
        <p className="text-xs text-fg-muted">
          OBS: Settings → Stream → Service <em>Custom…</em>, paste the server + key above, then Start Streaming.
        </p>
        {existing.playback_id && (
          <Link
            href={`/live/${existing.playback_id}`}
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          >
            Open viewer page
          </Link>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={createStream} className="space-y-3 rounded-xl border border-border bg-bg-muted p-5">
      <input
        placeholder="Stream title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        maxLength={200}
        className="w-full rounded-md border border-border bg-bg px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !title.trim()}
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create stream"}
      </button>
    </form>
  );
}

function Field({ label, value, trailing }: { label: string; value: string; trailing?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-fg-muted">{label}</span>
        {trailing}
      </div>
      <code className="block overflow-x-auto rounded-md bg-bg px-3 py-2 font-mono text-xs">{value}</code>
    </div>
  );
}
