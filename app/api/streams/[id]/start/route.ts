import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/**
 * Mark a stream as live.
 *
 * Called by the browser broadcaster after the WHIP handshake succeeds, so the
 * viewer page (which gates the HLS player on `status === "live"`) flips on
 * without waiting for a Livepeer webhook round-trip.
 *
 * Owner-only. Idempotent for already-live streams.
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
    return NextResponse.json({ error: "Stream already ended" }, { status: 409 });
  }

  const patch: Record<string, unknown> = { status: "live" };
  if (stream.status !== "live") {
    patch.started_at = new Date().toISOString();
  }

  const { error } = await service.from("streams").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
