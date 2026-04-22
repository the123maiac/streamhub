"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = "idle" | "probing" | "uploading" | "registering" | "done" | "error";

export function UploadForm({ userId }: { userId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a video file first.");
      return;
    }
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setError("File too big (max 2 GB).");
      return;
    }

    setStage("probing");
    const meta = await probe(file).catch((err) => {
      setError(`Couldn't read file: ${err.message}`);
      setStage("error");
      return null;
    });
    if (!meta) return;

    const kind: "short" | "long" = meta.duration <= 60 && meta.height >= meta.width ? "short" : "long";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp4";
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;

    setStage("uploading");
    const supabase = createClient();
    const { error: upErr } = await supabase.storage
      .from("videos")
      .upload(path, file, { upsert: false, contentType: file.type || "video/mp4" });
    if (upErr) {
      setError(upErr.message);
      setStage("error");
      return;
    }
    setProgress(100);

    setStage("registering");
    const res = await fetch("/api/videos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: title || file.name,
        description: description || null,
        kind,
        source_path: path,
        duration_seconds: meta.duration,
        width: meta.width,
        height: meta.height,
        visibility,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }));
      setError(body.error ?? `Server error ${res.status}`);
      setStage("error");
      return;
    }
    const { id } = await res.json();
    setStage("done");
    router.push(kind === "short" ? `/s/${id}` : `/watch/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-border bg-bg-muted p-5">
      <input
        type="file"
        accept="video/*"
        ref={fileRef}
        required
        className="block w-full text-sm"
      />
      <input
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        className="w-full rounded-md border border-border bg-bg px-3 py-2"
      />
      <textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={5000}
        rows={3}
        className="w-full rounded-md border border-border bg-bg px-3 py-2"
      />
      <label className="flex items-center gap-2 text-sm">
        Visibility:
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as "public" | "unlisted" | "private")}
          className="rounded-md border border-border bg-bg px-2 py-1"
        >
          <option value="public">Public</option>
          <option value="unlisted">Unlisted</option>
          <option value="private">Private</option>
        </select>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {stage === "uploading" && <p className="text-sm text-fg-muted">Uploading… {progress}%</p>}
      {stage === "probing" && <p className="text-sm text-fg-muted">Reading file…</p>}
      {stage === "registering" && <p className="text-sm text-fg-muted">Queueing for processing…</p>}
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

async function probe(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;
      URL.revokeObjectURL(url);
      resolve({ duration, width, height });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported video format"));
    };
    video.src = url;
  });
}
