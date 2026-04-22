import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "../db";
import { supabase, updateVideo } from "../db";
import { runFfmpeg, probeVideo } from "../ffmpeg";
import { downloadFromBucket, uploadToBucket } from "../storage";

type Payload = {
  source_path: string;
  kind: "short" | "long";
  trim: { start: number; end: number };
  overlay: { text: string; start: number; end: number } | null;
  audio: { track_id: string; mode: "mix" | "replace"; file_path: string | null } | null;
};

export async function handleEdit(job: Job): Promise<void> {
  if (!job.video_id) throw new Error("edit job missing video_id");
  const payload = job.payload as Payload;

  const workDir = join(tmpdir(), `streamhub-edit-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const srcFile = join(workDir, "source.bin");
    await downloadFromBucket("videos", payload.source_path, srcFile);

    let audioFile: string | null = null;
    if (payload.audio && payload.audio.file_path) {
      audioFile = join(workDir, "overlay-audio.bin");
      await downloadFromBucket("audio", payload.audio.file_path, audioFile);
    }

    const editedMp4 = join(workDir, "edited.mp4");
    await renderEdit(srcFile, editedMp4, audioFile, payload);

    // Upload edited MP4 as the new source, reusing the same key prefix.
    const newSourcePath = `${payload.source_path.replace(/\.[^.]+$/, "")}-edit-${Date.now()}.mp4`;
    await uploadToBucket("videos", newSourcePath, editedMp4, "video/mp4");

    const meta = await probeVideo(editedMp4);

    await updateVideo(job.video_id, {
      source_path: newSourcePath,
      duration_seconds: meta.duration,
      width: meta.width,
      height: meta.height,
      status: "processing",
    });

    // Requeue a transcode against the edited source.
    await supabase().from("processing_jobs").insert({
      kind: "transcode",
      video_id: job.video_id,
      payload: { source_path: newSourcePath, kind: payload.kind },
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function renderEdit(
  src: string,
  dest: string,
  audioFile: string | null,
  payload: Payload
): Promise<void> {
  const { trim, overlay, audio } = payload;
  const duration = Math.max(0.1, trim.end - trim.start);

  const args: string[] = ["-ss", String(trim.start), "-i", src];
  if (audioFile && audio) {
    args.push("-i", audioFile);
  }
  args.push("-t", String(duration));

  // Build filter graph.
  const videoFilters: string[] = [];
  if (overlay && overlay.end > overlay.start) {
    const t = escapeDrawtext(overlay.text);
    const from = Math.max(0, overlay.start - trim.start);
    const to = Math.max(from, overlay.end - trim.start);
    videoFilters.push(
      `drawtext=text='${t}':fontcolor=white:fontsize=h/18:box=1:boxcolor=black@0.5:boxborderw=12:` +
        `x=(w-text_w)/2:y=h-(text_h*2):enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'`
    );
  }

  if (videoFilters.length) {
    args.push("-vf", videoFilters.join(","));
  }

  if (audioFile && audio) {
    if (audio.mode === "replace") {
      args.push("-map", "0:v:0", "-map", "1:a:0", "-shortest");
    } else {
      args.push(
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=shortest:dropout_transition=0[aout]",
        "-map",
        "0:v:0",
        "-map",
        "[aout]"
      );
    }
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    dest
  );

  await runFfmpeg(args);
}

function escapeDrawtext(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

