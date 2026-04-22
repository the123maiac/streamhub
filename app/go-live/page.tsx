import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GoLivePanel } from "@/components/GoLivePanel";

export default async function GoLivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/go-live");

  const { data: existing } = await supabase
    .from("streams")
    .select("id, playback_id, stream_key, title, status, started_at")
    .eq("owner_id", user.id)
    .in("status", ["idle", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Go live</h1>
      <p className="text-sm text-fg-muted">
        Create a stream, point OBS at the RTMP URL with your stream key, and start streaming.
        The public viewer page opens as soon as Livepeer reports the stream as live.
      </p>
      <GoLivePanel existing={existing ?? null} />
    </div>
  );
}
