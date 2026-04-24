"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type EditorClip = {
  id: string;
  title: string;
  kind: "short" | "long";
  duration: number;
  previewUrl: string;
  thumbUrl: string | null;
};

export type EditorTrack = {
  id: string;
  title: string;
  duration: number;
  previewUrl: string;
};

type TimelineClip = { uid: string; video: EditorClip; trimStart: number; trimEnd: number };

type Props = {
  videos: EditorClip[];
  tracks: EditorTrack[];
  initialClipId?: string;
  initialAudioId?: string;
};

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function VideoEditor({ videos, tracks, initialClipId, initialAudioId }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const initial = videos.find((v) => v.id === initialClipId) ?? videos[0];
  const [clips, setClips] = useState<TimelineClip[]>([
    { uid: crypto.randomUUID(), video: initial, trimStart: 0, trimEnd: initial.duration },
  ]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");

  const [overlayText, setOverlayText] = useState("");
  const [overlayStart, setOverlayStart] = useState(0);
  const [overlayEnd, setOverlayEnd] = useState(3);

  const [audioId, setAudioId] = useState<string>(initialAudioId ?? "");
  const [audioMode, setAudioMode] = useState<"mix" | "replace">("mix");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = clips[selectedIdx] ?? clips[0];
  const composedDuration = useMemo(() => clips.reduce((a, c) => a + Math.max(0, c.trimEnd - c.trimStart), 0), [clips]);
  const kind: "short" | "long" = composedDuration <= 60 && clips.every((c) => c.video.kind === "short") ? "short" : "long";

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const handler = () => setCurrentTime(el.currentTime);
    el.addEventListener("timeupdate", handler);
    return () => el.removeEventListener("timeupdate", handler);
  }, [selected?.uid]);

  useEffect(() => {
    // Reset preview to trim start when switching clips.
    const el = videoRef.current;
    if (el && selected) {
      if (el.currentTime < selected.trimStart || el.currentTime > selected.trimEnd) {
        el.currentTime = selected.trimStart;
      }
    }
  }, [selectedIdx, selected?.trimStart, selected?.trimEnd]);

  function updateClip(uid: string, patch: Partial<TimelineClip>) {
    setClips((cs) => cs.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  }

  function addClip(videoId: string) {
    const v = videos.find((x) => x.id === videoId);
    if (!v) return;
    setClips((cs) => [...cs, { uid: crypto.randomUUID(), video: v, trimStart: 0, trimEnd: v.duration }]);
    setSelectedIdx(clips.length);
  }

  function removeClip(uid: string) {
    setClips((cs) => {
      const next = cs.filter((c) => c.uid !== uid);
      if (next.length === 0) return cs; // must keep at least one
      return next;
    });
    setSelectedIdx((i) => Math.max(0, Math.min(i, clips.length - 2)));
  }

  function moveClip(uid: string, dir: -1 | 1) {
    setClips((cs) => {
      const i = cs.findIndex((c) => c.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= cs.length) return cs;
      const next = cs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function setTrimFromCurrent(which: "start" | "end") {
    if (!selected) return;
    const t = Math.max(0, Math.min(selected.video.duration, currentTime));
    if (which === "start") updateClip(selected.uid, { trimStart: Math.min(t, selected.trimEnd - 0.1) });
    else updateClip(selected.uid, { trimEnd: Math.max(t, selected.trimStart + 0.1) });
  }

  function setOverlayFromCurrent(which: "start" | "end") {
    // Overlay uses composed timeline time. Compute current composed time from selected clip pos.
    const offset = clips.slice(0, selectedIdx).reduce((a, c) => a + Math.max(0, c.trimEnd - c.trimStart), 0);
    const rel = Math.max(0, Math.min(selected.trimEnd - selected.trimStart, currentTime - selected.trimStart));
    const t = offset + rel;
    if (which === "start") setOverlayStart(Math.min(t, overlayEnd - 0.1));
    else setOverlayEnd(Math.max(t, overlayStart + 0.1));
  }

  async function save() {
    if (!title.trim()) {
      setError("Give the video a title.");
      return;
    }
    if (clips.some((c) => c.trimEnd <= c.trimStart)) {
      setError("Every clip must have trim end after start.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      title: title.trim(),
      kind,
      visibility,
      clips: clips.map((c) => ({
        video_id: c.video.id,
        trim: { start: c.trimStart, end: c.trimEnd },
      })),
      overlay: overlayText.trim()
        ? { text: overlayText.trim(), start: overlayStart, end: Math.min(overlayEnd, composedDuration) }
        : null,
      audio: audioId ? { track_id: audioId, mode: audioMode } : null,
    };
    const res = await fetch("/api/compositions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Failed" }));
      setError(j.error ?? "Failed to save");
      return;
    }
    const { id } = await res.json();
    router.push(kind === "short" ? `/s/${id}` : `/watch/${id}`);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* LEFT: preview + timeline */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <video
              ref={videoRef}
              key={selected.video.id}
              src={selected.video.previewUrl}
              controls
              playsInline
              className="aspect-video w-full"
              onLoadedMetadata={() => {
                const el = videoRef.current;
                if (el) el.currentTime = selected.trimStart;
              }}
            />
          </div>

          {/* Trim controls for selected clip */}
          <div className="rounded-xl border border-border bg-bg-muted p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <div className="font-medium">Clip: {selected.video.title}</div>
              <div className="text-xs text-fg-muted">
                current {fmt(currentTime)} · duration {fmt(selected.video.duration)}
              </div>
            </div>
            <TrimSlider
              duration={selected.video.duration}
              start={selected.trimStart}
              end={selected.trimEnd}
              onChange={(s, e) => updateClip(selected.uid, { trimStart: s, trimEnd: e })}
            />
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setTrimFromCurrent("start")}
                className="rounded-md border border-border px-2 py-1 hover:bg-bg-elevated"
              >
                Set trim start to {fmt(currentTime)}
              </button>
              <button
                type="button"
                onClick={() => setTrimFromCurrent("end")}
                className="rounded-md border border-border px-2 py-1 hover:bg-bg-elevated"
              >
                Set trim end to {fmt(currentTime)}
              </button>
              <span className="ml-auto text-fg-muted">
                kept {fmt(Math.max(0, selected.trimEnd - selected.trimStart))}
              </span>
            </div>
          </div>

          {/* Clip list / reorder */}
          <div className="rounded-xl border border-border bg-bg-muted p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">Timeline ({clips.length} clip{clips.length === 1 ? "" : "s"})</span>
              <span className="text-xs text-fg-muted">total {fmt(composedDuration)}</span>
            </div>
            <ul className="space-y-2">
              {clips.map((c, i) => (
                <li
                  key={c.uid}
                  className={`flex items-center gap-2 rounded-md border px-2 py-2 ${
                    i === selectedIdx ? "border-accent bg-bg-elevated" : "border-border"
                  }`}
                >
                  <button type="button" onClick={() => setSelectedIdx(i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    {c.video.thumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.video.thumbUrl} alt="" className="h-10 w-16 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-16 rounded bg-bg" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm">{c.video.title}</div>
                      <div className="text-[10px] text-fg-muted">
                        {fmt(c.trimStart)} → {fmt(c.trimEnd)}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1 text-xs">
                    <button type="button" onClick={() => moveClip(c.uid, -1)} disabled={i === 0} className="rounded px-1.5 py-0.5 hover:bg-bg disabled:opacity-30">↑</button>
                    <button type="button" onClick={() => moveClip(c.uid, 1)} disabled={i === clips.length - 1} className="rounded px-1.5 py-0.5 hover:bg-bg disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => removeClip(c.uid)} disabled={clips.length === 1} className="rounded px-1.5 py-0.5 hover:bg-bg disabled:opacity-30">×</button>
                  </div>
                </li>
              ))}
            </ul>
            <AddClipPicker videos={videos} onAdd={addClip} />
          </div>
        </div>

        {/* RIGHT: metadata, overlay, audio */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-bg-muted p-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-fg-muted">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs uppercase tracking-wide text-fg-muted">Visibility</span>
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as typeof visibility)}
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
                <option value="private">Private</option>
              </select>
            </label>
            <div className="text-xs text-fg-muted">
              Rendered as <strong>{kind}</strong> · {fmt(composedDuration)} total
            </div>
          </div>

          <div className="rounded-xl border border-border bg-bg-muted p-4 space-y-2">
            <div className="text-sm font-medium">Text overlay</div>
            <input
              placeholder="Overlay text (blank to skip)"
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value)}
              maxLength={120}
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
            />
            {overlayText && (
              <>
                <div className="flex gap-2 text-xs">
                  <button type="button" onClick={() => setOverlayFromCurrent("start")} className="rounded-md border border-border px-2 py-1">
                    Start @ playhead
                  </button>
                  <button type="button" onClick={() => setOverlayFromCurrent("end")} className="rounded-md border border-border px-2 py-1">
                    End @ playhead
                  </button>
                </div>
                <div className="text-xs text-fg-muted">
                  shows {fmt(overlayStart)} → {fmt(overlayEnd)} (composed time)
                </div>
              </>
            )}
          </div>

          <div className="rounded-xl border border-border bg-bg-muted p-4 space-y-2">
            <div className="text-sm font-medium">Music</div>
            <select
              value={audioId}
              onChange={(e) => setAudioId(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-1.5 text-sm"
            >
              <option value="">— Keep original audio —</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title} ({Math.round(t.duration)}s)
                </option>
              ))}
            </select>
            {audioId && (
              <>
                <audio src={tracks.find((t) => t.id === audioId)?.previewUrl} controls className="w-full" />
                <div className="flex gap-2 text-xs">
                  {(["mix", "replace"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setAudioMode(m)}
                      className={`rounded-md px-2 py-1 ${audioMode === m ? "bg-accent text-accent-fg" : "border border-border"}`}
                    >
                      {m === "mix" ? "Mix" : "Replace"}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            onClick={save}
            disabled={saving || !title.trim()}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {saving ? "Rendering…" : "Save video"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TrimSlider({
  duration,
  start,
  end,
  onChange,
}: {
  duration: number;
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}) {
  const pct = (t: number) => (duration > 0 ? (t / duration) * 100 : 0);
  return (
    <div className="space-y-2">
      <div className="relative h-8 rounded-md bg-bg">
        <div
          className="absolute top-0 bottom-0 rounded-md bg-accent/30"
          style={{ left: `${pct(start)}%`, right: `${100 - pct(end)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label>
          Start
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={start}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange(Math.min(v, end - 0.1), end);
            }}
            className="block w-full"
          />
          <span>{fmt(start)}</span>
        </label>
        <label>
          End
          <input
            type="range"
            min={0}
            max={duration}
            step={0.1}
            value={end}
            onChange={(e) => {
              const v = Number(e.target.value);
              onChange(start, Math.max(v, start + 0.1));
            }}
            className="block w-full"
          />
          <span>{fmt(end)}</span>
        </label>
      </div>
    </div>
  );
}

function AddClipPicker({ videos, onAdd }: { videos: EditorClip[]; onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-md border border-dashed border-border px-3 py-2 text-xs text-fg-muted hover:bg-bg-elevated"
      >
        + Add another clip
      </button>
    );
  }
  return (
    <div className="mt-2 flex gap-2">
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="flex-1 rounded-md border border-border bg-bg px-2 py-1 text-xs">
        <option value="">Pick a video…</option>
        {videos.map((v) => (
          <option key={v.id} value={v.id}>
            {v.title} ({Math.round(v.duration)}s)
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!sel}
        onClick={() => {
          onAdd(sel);
          setSel("");
          setOpen(false);
        }}
        className="rounded-md bg-accent px-3 py-1 text-xs text-accent-fg disabled:opacity-60"
      >
        Add
      </button>
      <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-2 py-1 text-xs">
        Cancel
      </button>
    </div>
  );
}
