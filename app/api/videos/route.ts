import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { consume } from "@/lib/rate-limit";

const Body = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  kind: z.enum(["short", "long"]),
  source_path: z.string().min(1),
  duration_seconds: z.number().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Bad request" }, { status: 400 });
  }
  const body = parsed.data;

  // Enforce short = vertical & ≤ 60s; long = everything else.
  if (body.kind === "short" && (body.duration_seconds > 61 || body.height < body.width)) {
    return NextResponse.json({ error: "Shorts must be ≤60s and vertical." }, { status: 400 });
  }

  const ok = await consume("upload:video", user.id);
  if (!ok) return NextResponse.json({ error: "Upload rate limit exceeded." }, { status: 429 });

  // Verify the uploaded object exists under the user's folder.
  const service = createServiceClient();
  const expectedPrefix = `${user.id}/`;
  if (!body.source_path.startsWith(expectedPrefix)) {
    return NextResponse.json({ error: "source_path doesn't match your user folder." }, { status: 400 });
  }
  const { data: obj, error: objErr } = await service.storage
    .from("videos")
    .list(user.id, { search: body.source_path.slice(expectedPrefix.length) });
  if (objErr || !obj || obj.length === 0) {
    return NextResponse.json({ error: "Uploaded file not found in storage." }, { status: 400 });
  }

  const { data: video, error: insErr } = await service
    .from("videos")
    .insert({
      owner_id: user.id,
      kind: body.kind,
      title: body.title,
      description: body.description ?? null,
      status: "processing",
      source_path: body.source_path,
      duration_seconds: body.duration_seconds,
      width: body.width,
      height: body.height,
      visibility: body.visibility,
    })
    .select("id")
    .single();
  if (insErr || !video) {
    return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 500 });
  }

  const { error: jobErr } = await service.from("processing_jobs").insert({
    kind: "transcode",
    video_id: video.id,
    payload: { source_path: body.source_path, kind: body.kind },
  });
  if (jobErr) {
    return NextResponse.json({ error: jobErr.message }, { status: 500 });
  }

  return NextResponse.json({ id: video.id });
}
