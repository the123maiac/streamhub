import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NewConversationForm } from "@/components/NewConversationForm";

export default async function NewMessagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/messages/new");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">New conversation</h1>
      <NewConversationForm />
    </div>
  );
}
