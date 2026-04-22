import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const service = createServiceClient();
  await service.from("video_views").insert({
    video_id: id,
    viewer_id: user?.id ?? null,
    watched_seconds: 0,
  });
  await service.rpc("increment_video_views", { p_video_id: id });
  return NextResponse.json({ ok: true });
}
