import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/UploadForm";

export default async function UploadPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/upload");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Upload a video</h1>
      <p className="text-sm text-fg-muted">
        Short-form vertical clips ≤ 60s post to <strong>Shorts</strong>. Anything longer posts to <strong>Videos</strong>. Up to 10 uploads/day.
      </p>
      <UploadForm userId={user.id} />
    </div>
  );
}
