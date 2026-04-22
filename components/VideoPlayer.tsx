"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";

type Props = {
  hlsUrl: string | null;
  mp4Url: string | null;
  poster?: string;
};

export function VideoPlayer({ hlsUrl, mp4Url, poster }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (hlsUrl && el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = hlsUrl;
      return;
    }
    if (hlsUrl && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(hlsUrl);
      hls.attachMedia(el);
      return () => hls.destroy();
    }
    if (mp4Url) {
      el.src = mp4Url;
    }
  }, [hlsUrl, mp4Url]);

  return (
    <video
      ref={ref}
      controls
      poster={poster}
      className="aspect-video w-full rounded-xl bg-black"
      playsInline
    />
  );
}
