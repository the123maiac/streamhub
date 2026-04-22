import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/messages");

  return (
    <div className="mx-auto max-w-xl space-y-3">
      <h1 className="text-2xl font-semibold">Messages</h1>
      <p className="text-sm text-fg-muted">DMs and group chats ship in Phase 4.</p>
    </div>
  );
}
