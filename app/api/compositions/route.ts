import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { consume } from "@/lib/rate-limit";

const Body = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(["short", "long"]),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
  clips: z
    .array(
      z.object({
        video_id: z.string().uuid(),
        trim: z.object({ start: z.number().min(0), end: z.number().positive() }),
      })
    )
    .min(1)
    .max(20),
  overlay: z
    .object({ text: z.string().min(1).max(120), start: z.number().min(0), end: z.number().min(0) })
    .nullable()
    .optional(),
  audio: z
    .object({ track_id: z.string().uuid(), mode: z.enum(["mix", "replace"]) })
    .nullable()
    .optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  const body = parsed.data;

  const ok = await consume("upload:video", user.id);
  if (!ok) return NextResponse.json({ error: "Upload rate limit exceeded." }, { status: 429 });

  const service = createServiceClient();

  // Verify all source clips belong to the user.
  const videoIds = body.clips.map((c) => c.video_id);
  type Src = { id: string; owner_id: string; source_path: string | null };
  const { data: sources, error: srcErr } = await service
    .from("videos")
    .select("id, owner_id, source_path")
    .in("id", videoIds);
  if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 });
  const byId = new Map<string, Src>(((sources ?? []) as Src[]).map((v) => [v.id, v]));
  for (const clip of body.clips) {
    const src = byId.get(clip.video_id);
    if (!src || src.owner_id !== user.id || !src.source_path) {
      return NextResponse.json({ error: "Clip source not available" }, { status: 400 });
    }
    if (clip.trim.end <= clip.trim.start) {
      return NextResponse.json({ error: "Clip trim end must be after start" }, { status: 400 });
    }
  }

  let audioPath: string | null = null;
  if (body.audio) {
    const { data: track } = await service
      .from("audio_tracks")
      .select("file_path")
      .eq("id", body.audio.track_id)
      .maybeSingle();
    if (!track) return NextResponse.json({ error: "Audio track not found" }, { status: 400 });
    audioPath = track.file_path;
  }

  // Create a new video row in 'processing' with no source yet (worker fills it).
  const { data: video, error: insErr } = await service
    .from("videos")
    .insert({
      owner_id: user.id,
      kind: body.kind,
      title: body.title,
      status: "processing",
      visibility: body.visibility,
    })
    .select("id")
    .single();
  if (insErr || !video) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });

  if (body.audio) {
    await service.from("video_audio_uses").insert({ video_id: video.id, audio_track_id: body.audio.track_id });
  }

  const { error: jobErr } = await service.from("processing_jobs").insert({
    kind: "edit",
    video_id: video.id,
    payload: {
      kind: body.kind,
      clips: body.clips.map((c) => ({
        source_path: byId.get(c.video_id)!.source_path,
        trim: c.trim,
      })),
      overlay: body.overlay ?? null,
      audio: body.audio ? { ...body.audio, file_path: audioPath } : null,
    },
  });
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  return NextResponse.json({ id: video.id });
}
