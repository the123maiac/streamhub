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
