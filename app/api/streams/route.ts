import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { consume } from "@/lib/rate-limit";
import { createStream } from "@/lib/livepeer/client";

const Body = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(60).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const ok = await consume("stream:start", user.id);
  if (!ok) return NextResponse.json({ error: "Stream-start rate limit exceeded." }, { status: 429 });

  const lp = await createStream(parsed.data.title).catch((err) => {
    return { error: err instanceof Error ? err.message : String(err) };
  });
  if ("error" in lp) return NextResponse.json({ error: `Livepeer: ${lp.error}` }, { status: 502 });

  const service = createServiceClient();
  const { data: row, error } = await service
    .from("streams")
    .insert({
      owner_id: user.id,
      livepeer_stream_id: lp.id,
      playback_id: lp.playbackId,
      stream_key: lp.streamKey,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      category: parsed.data.category ?? null,
      status: "idle",
    })
    .select("id, playback_id, stream_key")
    .single();
  if (error || !row) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  return NextResponse.json(row);
}
