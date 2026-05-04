const LIVEPEER_BASE = "https://livepeer.studio/api";

type LivepeerStream = {
  id: string;
  streamKey: string;
  playbackId: string;
  name: string;
  record?: boolean;
};

async function livepeerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = process.env.LIVEPEER_API_KEY;
  if (!apiKey) throw new Error("LIVEPEER_API_KEY is not set");
  const res = await fetch(`${LIVEPEER_BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Livepeer ${res.status} ${res.statusText}: ${body}`);
  }
  return res;
}

export async function createStream(name: string): Promise<LivepeerStream> {
  const res = await livepeerFetch("/stream", {
    method: "POST",
    body: JSON.stringify({ name, record: true }),
  });
  return (await res.json()) as LivepeerStream;
}

export async function getStream(id: string): Promise<LivepeerStream> {
  const res = await livepeerFetch(`/stream/${id}`);
  return (await res.json()) as LivepeerStream;
}

export async function deleteStream(id: string): Promise<void> {
  await livepeerFetch(`/stream/${id}`, { method: "DELETE" });
}

export function playbackUrl(playbackId: string): string {
  return `https://livepeercdn.studio/hls/${playbackId}/index.m3u8`;
}

/**
 * WHIP (WebRTC-HTTP Ingestion Protocol) endpoint for browser broadcasting.
 * The broadcaster POSTs an SDP offer here with the stream key in the path;
 * Livepeer responds with an SDP answer and a `Location` header pointing
 * at the resource URL to DELETE when the broadcast ends.
 *
 * Override the base via NEXT_PUBLIC_LIVEPEER_WHIP_BASE if Livepeer rotates it.
 */
export function whipIngestUrl(streamKey: string): string {
  const base =
    process.env.NEXT_PUBLIC_LIVEPEER_WHIP_BASE ?? "https://webrtc.livepeer.studio/webrtc";
  return `${base}/${streamKey}`;
}
