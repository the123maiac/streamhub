"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { whipIngestUrl } from "@/lib/livepeer/client";
import { publishWhip, type WhipSession } from "@/lib/whip";

type Existing = {
  id: string;
  playback_id: string | null;
  stream_key: string | null;
  title: string;
  status: "idle" | "live" | "ended";
  started_at: string | null;
} | null;

const RTMP_INGEST = "rtmp://rtmp.livepeer.com/live";

type ShareState = "idle" | "requesting" | "connecting" | "live" | "stopping" | "error";

export function GoLivePanel({ existing }: { existing: Existing }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <div className="space-y-4">
        <BrowserShareCard existing={existing} />
        <ObsCard existing={existing} />
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

/* ──────────────────────────────────────────────────────────────────────────
 * Browser screen-share card — captures the screen via getDisplayMedia and
 * pushes it to Livepeer over WHIP. Viewers continue to watch the existing
 * HLS playback URL on /live/[playback_id].
 * ────────────────────────────────────────────────────────────────────────── */

function BrowserShareCard({ existing }: { existing: NonNullable<Existing> }) {
  const [state, setState] = useState<ShareState>(
    existing.status === "live" ? "live" : "idle",
  );
  const [includeMic, setIncludeMic] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<WhipSession | null>(null);
  const displayRef = useRef<MediaStream | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    displayRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    wakeLockRef.current?.release().catch(() => {});
    displayRef.current = null;
    micRef.current = null;
    audioCtxRef.current = null;
    wakeLockRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const stop = useCallback(
    async (markEnded: boolean) => {
      setState("stopping");
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) {
        try {
          await session.close();
        } catch {
          // best-effort
        }
      }
      cleanup();
      if (markEnded) {
        await fetch(`/api/streams/${existing.id}/stop`, { method: "POST" }).catch(
          () => {},
        );
      }
      setState("idle");
    },
    [cleanup, existing.id],
  );

  // Make sure we tear everything down on unmount / refresh.
  useEffect(() => {
    return () => {
      sessionRef.current?.close().catch(() => {});
      cleanup();
    };
  }, [cleanup]);

  // The screen Wake Lock auto-releases when the tab is hidden — re-acquire it
  // on visibility-change so background-tab throttling stays at bay throughout
  // the broadcast.
  useEffect(() => {
    if (state !== "live") return;
    function handler() {
      if (document.visibilityState === "visible" && !wakeLockRef.current) {
        navigator.wakeLock
          ?.request("screen")
          .then((lock) => {
            wakeLockRef.current = lock;
          })
          .catch(() => {});
      }
    }
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [state]);

  const start = useCallback(async () => {
    if (!existing.stream_key) {
      setErrorMsg("Stream key missing — recreate the stream.");
      return;
    }
    setErrorMsg(null);
    setState("requesting");

    let display: MediaStream;
    try {
      display = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // tab/system audio if the OS+browser allows it
      });
    } catch (err) {
      setState("idle");
      setErrorMsg(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Screen capture cancelled."
          : `Couldn't capture screen: ${
              err instanceof Error ? err.message : String(err)
            }`,
      );
      return;
    }
    displayRef.current = display;

    let mic: MediaStream | null = null;
    if (includeMic) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        micRef.current = mic;
      } catch (err) {
        // Mic is optional — surface a soft warning but keep going.
        console.warn("Microphone unavailable:", err);
      }
    }

    // Build the outbound MediaStream: screen video + a single mixed audio track.
    const outbound = new MediaStream();
    display.getVideoTracks().forEach((t) => outbound.addTrack(t));
    const audioTrack = mixAudio(display, mic);
    if (audioTrack) outbound.addTrack(audioTrack.track);
    if (audioTrack?.ctx) audioCtxRef.current = audioTrack.ctx;

    if (previewRef.current) {
      previewRef.current.srcObject = outbound;
      previewRef.current.muted = true; // avoid echo for the broadcaster
      previewRef.current.play().catch(() => {});
    }

    // If the user clicks the browser's native "Stop sharing" pill, end cleanly.
    display.getVideoTracks()[0]?.addEventListener("ended", () => {
      stop(true);
    });

    setState("connecting");
    try {
      const session = await publishWhip(whipIngestUrl(existing.stream_key), outbound);
      sessionRef.current = session;
      // Only tear down on terminal states. `disconnected` is often a transient
      // network blip (background tab, brief packet loss) that recovers on its
      // own — give it a generous window to come back before giving up.
      session.pc.addEventListener("connectionstatechange", () => {
        const cs = session.pc.connectionState;
        if (cs === "failed" || cs === "closed") {
          stop(true);
          return;
        }
        if (cs === "disconnected") {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (sessionRef.current?.pc.connectionState === "disconnected") {
              stop(true);
            }
          }, 30_000);
        } else if (cs === "connected" && reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
      });
    } catch (err) {
      cleanup();
      setState("error");
      setErrorMsg(err instanceof Error ? err.message : String(err));
      return;
    }

    // Hold a screen Wake Lock so the OS/browser doesn't throttle this tab while
    // it's broadcasting — the main reason a stream "stops when you leave the
    // window" was background-tab throttling severing the WebRTC connection.
    if ("wakeLock" in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // Wake lock is best-effort; if denied, we just rely on the
        // tolerant connection-state handling above.
      }
    }

    await fetch(`/api/streams/${existing.id}/start`, { method: "POST" }).catch(() => {});
    setState("live");
  }, [cleanup, existing.id, existing.stream_key, includeMic, stop]);

  const isBusy =
    state === "requesting" || state === "connecting" || state === "stopping";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-bg-muted p-5 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">{existing.title}</h2>
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            state === "live" ? "bg-red-500 text-white" : "bg-bg-elevated text-fg-muted"
          }`}
        >
          {state === "live" ? "LIVE" : state === "connecting" ? "CONNECTING" : "OFFLINE"}
        </span>
      </div>

      <div className="aspect-video overflow-hidden rounded-lg bg-black">
        {state === "idle" || state === "error" ? (
          <div className="flex h-full items-center justify-center text-xs text-fg-muted">
            Click <span className="mx-1 font-medium">Share screen</span> to pick a
            window or tab.
          </div>
        ) : (
          <video
            ref={previewRef}
            playsInline
            className="h-full w-full object-contain"
          />
        )}
      </div>

      <label className="flex items-center gap-2 text-xs text-fg-muted">
        <input
          type="checkbox"
          checked={includeMic}
          onChange={(e) => setIncludeMic(e.target.checked)}
          disabled={state === "live" || isBusy}
        />
        Include microphone
      </label>

      {errorMsg && <p className="text-sm text-red-400">{errorMsg}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {state === "live" || isBusy ? (
          <button
            type="button"
            onClick={() => stop(true)}
            disabled={state === "stopping"}
            className="rounded-md bg-red-500 px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {state === "stopping" ? "Stopping…" : "Stop streaming"}
          </button>
        ) : (
          <button
            type="button"
            onClick={start}
            className="rounded-md bg-accent px-4 py-2 font-medium text-accent-fg"
          >
            Share screen
          </button>
        )}
        {existing.playback_id && (
          <Link
            href={`/live/${existing.playback_id}`}
            target="_blank"
            className="rounded-md border border-border px-4 py-2 font-medium hover:bg-bg-elevated"
          >
            Open viewer page
          </Link>
        )}
      </div>

      <p className="text-xs text-fg-muted">
        Viewers watch over HLS at <code>/live/{existing.playback_id}</code>. Expect
        a few seconds of glass-to-glass latency once the stream goes live.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * OBS / external encoder fallback. Same RTMP URL + key as before.
 * ────────────────────────────────────────────────────────────────────────── */

function ObsCard({ existing }: { existing: NonNullable<Existing> }) {
  const [showKey, setShowKey] = useState(false);

  return (
    <details className="rounded-xl border border-border bg-bg-muted p-5 text-sm">
      <summary className="cursor-pointer text-base font-medium">
        Or stream from OBS / an external encoder
      </summary>
      <div className="mt-3 space-y-3">
        <Field label="RTMP server" value={RTMP_INGEST} />
        <Field
          label="Stream key"
          value={showKey ? existing.stream_key ?? "" : "•".repeat(24)}
          trailing={
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="text-xs text-accent"
            >
              {showKey ? "Hide" : "Show"}
            </button>
          }
        />
        <p className="text-xs text-fg-muted">
          OBS: Settings → Stream → Service <em>Custom…</em>, paste the server +
          key above, then Start Streaming.
        </p>
      </div>
    </details>
  );
}

function Field({
  label,
  value,
  trailing,
}: {
  label: string;
  value: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-fg-muted">{label}</span>
        {trailing}
      </div>
      <code className="block overflow-x-auto rounded-md bg-bg px-3 py-2 font-mono text-xs">
        {value}
      </code>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Audio mixing helpers
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Combine display audio (if present) and mic audio (if present) into a single
 * MediaStreamTrack. Some WebRTC ingest servers (Livepeer included) don't reliably
 * accept multiple `m=audio` sections, so we mix client-side via Web Audio API
 * whenever both are available.
 *
 * Returns `null` if neither source has audio.
 */
function mixAudio(
  display: MediaStream,
  mic: MediaStream | null,
): { track: MediaStreamTrack; ctx: AudioContext | null } | null {
  const displayHasAudio = display.getAudioTracks().length > 0;
  const micHasAudio = !!mic && mic.getAudioTracks().length > 0;

  if (!displayHasAudio && !micHasAudio) return null;

  // Single source — no mixing needed.
  if (!displayHasAudio && micHasAudio) {
    return { track: mic!.getAudioTracks()[0], ctx: null };
  }
  if (displayHasAudio && !micHasAudio) {
    return { track: display.getAudioTracks()[0], ctx: null };
  }

  // Both present — mix.
  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  ctx.createMediaStreamSource(display).connect(dest);
  ctx.createMediaStreamSource(mic!).connect(dest);
  return { track: dest.stream.getAudioTracks()[0], ctx };
}
