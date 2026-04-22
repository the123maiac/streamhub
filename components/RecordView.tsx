"use client";

import { useEffect, useRef } from "react";

export function RecordView({ videoId }: { videoId: string }) {
  const pinged = useRef(false);
  useEffect(() => {
    if (pinged.current) return;
    pinged.current = true;
    const t = setTimeout(() => {
      fetch(`/api/videos/${videoId}/view`, { method: "POST" }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [videoId]);
  return null;
}
