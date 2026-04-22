import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  kind: z.enum(["dm", "group"]),
  usernames: z.array(z.string().min(1).max(30)).min(1).max(20),
  title: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { kind, usernames, title } = parsed.data;

  const { data: profs, error: profErr } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", usernames);
  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 });
  const foundUsernames = new Set((profs ?? []).map((p) => p.username));
  const missing = usernames.filter((u) => !foundUsernames.has(u));
  if (missing.length) return NextResponse.json({ error: `Unknown user(s): ${missing.join(", ")}` }, { status: 400 });
  const ids = (profs ?? []).map((p) => p.id).filter((id) => id !== user.id);
  if (ids.length === 0) return NextResponse.json({ error: "Cannot start a conversation with only yourself." }, { status: 400 });

  if (kind === "dm") {
    if (ids.length !== 1) return NextResponse.json({ error: "DMs must have exactly one recipient." }, { status: 400 });
    const { data, error } = await supabase.rpc("ensure_dm", { p_other: ids[0] });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data });
  }

  const { data, error } = await supabase.rpc("create_group_conversation", {
    p_title: title ?? "",
    p_member_ids: ids,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data });
}
