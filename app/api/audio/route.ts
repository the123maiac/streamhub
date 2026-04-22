import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  title: z.string().min(1).max(200),
  file_path: z.string().min(1).max(500),
  duration_seconds: z.number().nonnegative().nullable().optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data, error } = await supabase
    .from("audio_tracks")
    .insert({
      owner_id: user.id,
      title: parsed.data.title,
      source: "user_upload",
      file_path: parsed.data.file_path,
      duration_seconds: parsed.data.duration_seconds ?? null,
      is_reusable: true,
    })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
