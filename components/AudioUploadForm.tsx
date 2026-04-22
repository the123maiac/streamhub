"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = "idle" | "probing" | "uploading" | "registering" | "error";

export function AudioUploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick an audio file first.");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setError("Audio too large (max 25 MB).");
      return;
    }

    setStage("probing");
    const duration = await probeAudio(file).catch(() => null);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    setStage("uploading");
    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("audio")
      .upload(path, file, { upsert: false, contentType: file.type || "audio/mpeg" });
    if (upErr) {
      setError(upErr.message);
      setStage("error");
      return;
    }

    setStage("registering");
    const res = await fetch("/api/audio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title || file.name.replace(/\.[^.]+$/, ""),
        file_path: path,
        duration_seconds: duration,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      setError(body.error ?? `Server error ${res.status}`);
      setStage("error");
      return;
    }
    const { id } = await res.json();
    router.push(`/music/${id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-border bg-bg-muted p-5">
      <input type="file" accept="audio/*" ref={fileRef} required className="block w-full text-sm" />
      <input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="w-full rounded-md border border-border bg-bg px-3 py-2"
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      {stage !== "idle" && stage !== "error" && (
        <p className="text-sm text-fg-muted">{stage === "uploading" ? "Uploading…" : stage === "registering" ? "Saving…" : "Reading…"}</p>
      )}
      <button
        type="submit"
        disabled={stage !== "idle" && stage !== "error"}
        className="rounded-md bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-60"
      >
        Upload
      </button>
    </form>
  );
}

function probeAudio(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      const d = a.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : 0);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported audio format"));
    };
    a.src = url;
  });
}
