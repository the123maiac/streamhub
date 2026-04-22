"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewConversationForm() {
  const router = useRouter();
  const [kind, setKind] = useState<"dm" | "group">("dm");
  const [usernames, setUsernames] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const names = usernames.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
    if (names.length === 0) {
      setBusy(false);
      setError("Enter at least one username");
      return;
    }
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, usernames: names, title: title || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "Failed" }));
      setError(j.error ?? "Failed to create conversation");
      return;
    }
    const { id } = await res.json();
    router.push(`/messages/${id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-border bg-bg-muted p-5">
      <div className="flex gap-2 text-sm">
        {(["dm", "group"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-md px-3 py-1.5 ${kind === k ? "bg-accent text-accent-fg" : "border border-border"}`}
          >
            {k === "dm" ? "Direct message" : "Group"}
          </button>
        ))}
      </div>
      {kind === "group" && (
        <input
          placeholder="Group title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      )}
      <input
        placeholder={kind === "dm" ? "Username to DM" : "Usernames (comma or space separated)"}
        value={usernames}
        onChange={(e) => setUsernames(e.target.value)}
        required
        className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !usernames.trim()}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
      >
        {busy ? "Starting…" : "Start conversation"}
      </button>
    </form>
  );
}
