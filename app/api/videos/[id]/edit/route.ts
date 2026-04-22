import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const Body = z.object({
  trim: z.object({ start: z.number().min(0), end: z.number().positive() }),
  overlay: z
    .object({
      text: z.string().min(1).max(120),
      start: z.number().min(0),
      end: z.number().min(0),
    })
    .nullable()
    .optional(),
  audio: z
    .object({
      track_id: z.string().uuid(),
      mode: z.enum(["mix", "replace"]),
    })
    .nullable()
    .optional(),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: videoId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: video, error } = await supabase
    .from("videos")
    .select("id, owner_id, kind, source_path")
    .eq("id", videoId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!video) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (video.owner_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!video.source_path) return NextResponse.json({ error: "Video source missing" }, { status: 400 });

  const service = createServiceClient();

  let audioPath: string | null = null;
  if (parsed.data.audio) {
    const { data: track } = await service
      .from("audio_tracks")
      .select("file_path")
      .eq("id", parsed.data.audio.track_id)
      .maybeSingle();
    if (!track) return NextResponse.json({ error: "Audio track not found" }, { status: 400 });
    audioPath = track.file_path;

    await service.from("video_audio_uses").insert({ video_id: videoId, audio_track_id: parsed.data.audio.track_id }).select();
  }

  await service.from("videos").update({ status: "processing" }).eq("id", videoId);

  const { error: jobErr } = await service.from("processing_jobs").insert({
    kind: "edit",
    video_id: videoId,
    payload: {
      source_path: video.source_path,
      kind: video.kind,
      trim: parsed.data.trim,
      overlay: parsed.data.overlay ?? null,
      audio: parsed.data.audio ? { ...parsed.data.audio, file_path: audioPath } : null,
    },
  });
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
