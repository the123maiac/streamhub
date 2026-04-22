import { NextResponse } from "next/server";
import Ably from "ably";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rest = new Ably.Rest({ key: process.env.ABLY_API_KEY! });
  const tokenRequest = await rest.auth.createTokenRequest({
    clientId: user.id,
    capability: {
      // Users may publish + subscribe on their own notifications channel.
      [`user:${user.id}:notifications`]: ["subscribe", "presence"],
      // Anyone can subscribe to live stream chat; publishing is rate-limited server-side.
      "stream:*": ["subscribe", "publish", "presence"],
      // DMs + groups are scoped by membership; checked at webhook-mirror time.
      "dm:*": ["subscribe", "publish", "presence"],
      "group:*": ["subscribe", "publish", "presence"],
    },
  });
  return NextResponse.json(tokenRequest);
}
