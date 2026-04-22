"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { publicUrl } from "@/lib/storage";

type Initial = {
  username: string;
  display_name: string;
  bio: string | null;
  ui_theme: string;
  avatar_url: string | null;
};

export function EditProfileForm({ userId, initial }: { userId: string; initial: Initial }) {
  const router = useRouter();
  const [username, setUsername] = useState(initial.username);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [theme, setTheme] = useState(initial.ui_theme);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Avatar must be an image.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("Avatar must be under 3 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setError(upErr.message);
      setBusy(false);
      return;
    }
    await supabase.from("profiles").update({ avatar_url: path }).eq("id", userId);
    setAvatarUrl(path);
    setBusy(false);
    router.refresh();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("update_own_profile", {
      p_username: username,
      p_display_name: displayName,
      p_bio: bio,
      p_ui_theme: theme,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Saved.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-xl border border-border bg-bg-muted p-5">
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 overflow-hidden rounded-full bg-bg-elevated">
          {avatarUrl && <Image src={publicUrl("avatars", avatarUrl)} alt="" fill className="object-cover" />}
        </div>
        <label className="cursor-pointer text-sm text-accent underline">
          Change avatar
          <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
        </label>
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg-muted">Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          className="w-full rounded-md border border-border bg-bg px-3 py-2"
          maxLength={30}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg-muted">Display name</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-md border border-border bg-bg px-3 py-2"
          maxLength={60}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg-muted">Bio</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-md border border-border bg-bg px-3 py-2"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-fg-muted">Theme</label>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="rounded-md border border-border bg-bg px-3 py-2"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">System</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {message && <p className="text-sm text-green-400">{message}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
      >
        Save
      </button>
    </form>
  );
}
