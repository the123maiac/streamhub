import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAblyRest } from "@/lib/ably/client";

const Body = z.object({
  body: z.string().min(1).max(2000),
});

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, kind")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: inserted, error } = await supabase
    .from("messages")
    .insert({ conversation_id: conversationId, author_id: user.id, body: parsed.data.body })
    .select("id, created_at")
    .single();
  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });

  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

  const { data: me } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();

  try {
    const rest = createAblyRest();
    const channel = rest.channels.get(`${conv.kind}:${conversationId}`);
    await channel.publish("message", {
      dbId: inserted.id,
      authorId: user.id,
      username: me?.username ?? "user",
      body: parsed.data.body,
    });
  } catch {
    // Message is persisted; realtime broadcast is best-effort.
  }

  return NextResponse.json({ id: inserted.id });
}
