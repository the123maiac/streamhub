import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GoLivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/go-live");

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <h1 className="text-2xl font-semibold">Go live</h1>
      <p className="text-sm text-fg-muted">
        Livestreaming lands in Phase 3. This page will let you create a Livepeer stream, show the RTMP URL + key for OBS, and open the live viewer page when you start streaming.
      </p>
    </div>
  );
}
