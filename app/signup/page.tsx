"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (!/^[a-z0-9_]{3,30}$/.test(username)) {
      setError("Username must be 3–30 chars: lowercase letters, digits, underscores.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName || username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.user && !data.session) {
      setMessage("Check your email to confirm your account.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 pt-12">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border border-border bg-bg-muted px-3 py-2" />
        <input type="password" required placeholder="Password (8+ chars)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-md border border-border bg-bg-muted px-3 py-2" />
        <input type="text" required placeholder="username (a–z 0–9 _)" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} className="w-full rounded-md border border-border bg-bg-muted px-3 py-2" />
        <input type="text" placeholder="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full rounded-md border border-border bg-bg-muted px-3 py-2" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-400">{message}</p>}
        <button type="submit" disabled={loading} className="w-full rounded-md bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60">
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm text-fg-muted">
        Have an account? <Link href="/login" className="text-fg underline">Log in</Link>
      </p>
    </div>
  );
}
