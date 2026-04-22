import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, bio, ui_theme")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="rounded-xl bg-bg-muted p-4 text-sm">
        <p><strong>Username:</strong> @{profile?.username}</p>
        <p><strong>Display name:</strong> {profile?.display_name}</p>
        <p><strong>Theme:</strong> {profile?.ui_theme}</p>
      </div>
      <p className="text-sm text-fg-muted">
        Full settings UI (theme toggle, bio editor, avatar, notification prefs) lands in Phase 7.
      </p>
    </div>
  );
}
