import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const raw = await request.text();
  const secret = process.env.LIVEPEER_WEBHOOK_SECRET;
  if (secret) {
    const sig = request.headers.get("livepeer-signature") ?? "";
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const provided = sig.replace(/^sha256=/, "");
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }

  let body: { event?: string; stream?: { id?: string }; payload?: Record<string, unknown> };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad JSON" }, { status: 400 });
  }

  const service = createServiceClient();
  const livepeerId = body.stream?.id ?? (body.payload as { id?: string } | undefined)?.id ?? null;

  switch (body.event) {
    case "stream.started":
      if (livepeerId) await service.rpc("mark_stream_live", { p_livepeer_stream_id: livepeerId });
      break;
    case "stream.idle":
    case "stream.ended":
      if (livepeerId) {
        await service.rpc("mark_stream_ended", { p_livepeer_stream_id: livepeerId });
        // enqueue VOD import for the now-ended stream
        const { data: stream } = await service
          .from("streams")
          .select("id")
          .eq("livepeer_stream_id", livepeerId)
          .maybeSingle();
        if (stream) {
          await service.from("processing_jobs").insert({
            kind: "vod_import",
            stream_id: stream.id,
            payload: { livepeer_stream_id: livepeerId },
          });
        }
      }
      break;
    default:
      // ignore unknown events
      break;
  }

  return NextResponse.json({ ok: true });
}
