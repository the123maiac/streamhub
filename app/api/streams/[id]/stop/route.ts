import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Mark a stream as ended.
 *
 * Called by the browser broadcaster when they stop sharing — either by
 * clicking Stop or by hitting the browser's native "Stop sharing" pill.
 * Owner-only. Idempotent.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const service = createServiceClient();
  const { data: stream, error: lookupErr } = await service
    .from("streams")
    .select("owner_id, status")
    .eq("id", id)
    .maybeSingle();

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!stream) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (stream.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (stream.status === "ended") {
    return NextResponse.json({ ok: true });
  }

  const { error } = await service
    .from("streams")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
