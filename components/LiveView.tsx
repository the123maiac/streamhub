"use client";

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";

export function LiveView({ hlsUrl, status }: { hlsUrl: string; status: "idle" | "live" | "ended" }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playbackError, setPlaybackError] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = hlsUrl;
      return;
    }
    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hls.loadSource(hlsUrl);
      hls.attachMedia(el);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setPlaybackError(true);
      });
      return () => hls.destroy();
    }
  }, [hlsUrl]);

  if (status === "ended") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-bg-muted text-sm text-fg-muted">
        Stream has ended. A VOD will appear on the creator&apos;s profile shortly.
      </div>
    );
  }

  if (status === "idle") {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl bg-bg-muted text-sm text-fg-muted">
        Streamer hasn&apos;t gone live yet — refresh in a moment.
      </div>
    );
  }

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
      <video ref={ref} controls autoPlay playsInline className="h-full w-full" />
      <span className="absolute top-3 left-3 rounded bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
        LIVE
      </span>
      {playbackError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-white">
          Playback error — try refreshing.
        </div>
      )}
    </div>
  );
}
