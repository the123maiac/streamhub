import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditProfileForm } from "@/components/EditProfileForm";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/settings/profile");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, bio, ui_theme, avatar_url")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile) redirect("/");

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Edit profile</h1>
      <EditProfileForm userId={user.id} initial={profile} />
    </div>
  );
}
