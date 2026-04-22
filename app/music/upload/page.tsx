import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AudioUploadForm } from "@/components/AudioUploadForm";

export default async function UploadAudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/music/upload");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Upload audio</h1>
      <p className="text-sm text-fg-muted">MP3, WAV, or M4A up to 25 MB. Tracks become reusable across all creators.</p>
      <AudioUploadForm userId={user.id} />
    </div>
  );
}
