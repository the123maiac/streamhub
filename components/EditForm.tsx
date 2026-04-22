"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Track = { id: string; title: string; duration: number };

export function EditForm({ videoId, duration, tracks }: { videoId: string; duration: number; tracks: Track[] }) {
  const router = useRouter();
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(duration || 0);
  const [overlayText, setOverlayText] = useState("");
  const [overlayStart, setOverlayStart] = useState(0);
  const [overlayEnd, setOverlayEnd] = useState(Math.min(5, duration || 0));
  const [audioTrackId, setAudioTrackId] = useState<string>("");
  const [audioMix, setAudioMix] = useState<"replace" | "mix">("mix");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (trimEnd <= trimStart) {
      setError("Trim end must be after trim start.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      trim: { start: trimStart, end: trimEnd },
      overlay: overlayText.trim()
        ? { text: overlayText.trim().slice(0, 120), start: overlayStart, end: overlayEnd }
        : null,
      audio: audioTrackId ? { track_id: audioTrackId, mode: audioMix } : null,
    };
    const res = await fetch(`/api/videos/${videoId}/edit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Failed" }));
      setError(j.error ?? "Failed to queue edit");
      return;
    }
    router.push(`/watch/${videoId}`);
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border border-border bg-bg-muted p-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Trim</legend>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex-1">
            Start (s)
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={trimStart}
              onChange={(e) => setTrimStart(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-1.5"
            />
          </label>
          <label className="flex-1">
            End (s)
            <input
              type="number"
              min={0}
              max={duration || undefined}
              step={0.1}
              value={trimEnd}
              onChange={(e) => setTrimEnd(Number(e.target.value))}
              className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-1.5"
            />
          </label>
        </div>
        {duration > 0 && <p className="text-xs text-fg-muted">Source duration: {duration.toFixed(1)}s</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Text overlay (optional)</legend>
        <input
          placeholder="Overlay text"
          value={overlayText}
          onChange={(e) => setOverlayText(e.target.value)}
          maxLength={120}
          className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        />
        {overlayText && (
          <div className="flex items-center gap-3 text-sm">
            <label className="flex-1">
              From (s)
              <input
                type="number"
                min={0}
                step={0.1}
                value={overlayStart}
                onChange={(e) => setOverlayStart(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-1.5"
              />
            </label>
            <label className="flex-1">
              To (s)
              <input
                type="number"
                min={0}
                step={0.1}
                value={overlayEnd}
                onChange={(e) => setOverlayEnd(Number(e.target.value))}
                className="mt-1 block w-full rounded-md border border-border bg-bg px-3 py-1.5"
              />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Audio (optional)</legend>
        <select
          value={audioTrackId}
          onChange={(e) => setAudioTrackId(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
        >
          <option value="">— Keep original audio —</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({Math.round(t.duration)}s)
            </option>
          ))}
        </select>
        {audioTrackId && (
          <div className="flex gap-2 text-sm">
            {(["mix", "replace"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAudioMix(m)}
                className={`rounded-md px-3 py-1 ${audioMix === m ? "bg-accent text-accent-fg" : "border border-border"}`}
              >
                {m === "mix" ? "Mix with original" : "Replace original"}
              </button>
            ))}
          </div>
        )}
      </fieldset>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
      >
        {busy ? "Queueing…" : "Queue edit"}
      </button>
    </form>
  );
}
