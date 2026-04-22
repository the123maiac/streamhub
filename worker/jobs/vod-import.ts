import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "../db";
import { supabase } from "../db";

type Payload = { livepeer_stream_id: string };

type LivepeerSession = {
  id: string;
  createdAt?: number;
  recordingStatus?: string;
  recordingUrl?: string;
  mp4Url?: string;
  duration?: number;
};

const LIVEPEER_BASE = "https://livepeer.studio/api";

async function livepeerGet(path: string): Promise<Response> {
  const apiKey = process.env.LIVEPEER_API_KEY;
  if (!apiKey) throw new Error("LIVEPEER_API_KEY not set");
  const res = await fetch(`${LIVEPEER_BASE}${path}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Livepeer ${res.status}: ${await res.text().catch(() => "")}`);
  return res;
}

export async function handleVodImport(job: Job): Promise<void> {
  const payload = job.payload as Payload;
  const livepeerStreamId = payload.livepeer_stream_id;
  if (!livepeerStreamId) throw new Error("vod_import missing livepeer_stream_id");

  const sb = supabase();
  const { data: stream, error: streamErr } = await sb
    .from("streams")
    .select("id, owner_id, title, description, category")
    .eq("livepeer_stream_id", livepeerStreamId)
    .maybeSingle();
  if (streamErr) throw streamErr;
  if (!stream) throw new Error(`stream not found for livepeer id ${livepeerStreamId}`);

  const sessionsRes = await livepeerGet(`/session?parentId=${encodeURIComponent(livepeerStreamId)}`);
  const sessions = (await sessionsRes.json()) as LivepeerSession[];

  const ready = sessions
    .filter((s) => s.recordingStatus === "ready" && (s.mp4Url || s.recordingUrl))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];

  if (!ready) {
    // Recording not ready yet — requeue with a delay by throwing.
    throw new Error("recording not ready yet");
  }

  const mp4Url = ready.mp4Url ?? ready.recordingUrl!;

  const workDir = join(tmpdir(), `streamhub-vod-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    const mp4Path = join(workDir, "vod.mp4");
    const res = await fetch(mp4Url);
    if (!res.ok) throw new Error(`download recording failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(mp4Path, buf);

    const videoId = randomUUID();
    const sourceKey = `${stream.owner_id}/${videoId}/vod.mp4`;

    const { error: upErr } = await sb.storage.from("videos").upload(sourceKey, buf, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (upErr) throw upErr;

    const { error: insErr } = await sb.from("videos").insert({
      id: videoId,
      owner_id: stream.owner_id,
      kind: "long",
      title: `${stream.title} (VOD)`,
      description: stream.description,
      status: "processing",
      source_path: sourceKey,
      visibility: "public",
    });
    if (insErr) throw insErr;

    await sb.from("streams").update({ vod_video_id: videoId }).eq("id", stream.id);

    await sb.from("processing_jobs").insert({
      kind: "transcode",
      video_id: videoId,
      payload: { source_path: sourceKey, kind: "long" },
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
