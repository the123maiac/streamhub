import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "../db";
import { supabase, updateVideo } from "../db";
import { runFfmpeg, probeVideo } from "../ffmpeg";
import { downloadFromBucket, uploadToBucket } from "../storage";

type Clip = { source_path: string; trim: { start: number; end: number } };
type Payload = {
  kind: "short" | "long";
  clips: Clip[];
  overlay: { text: string; start: number; end: number } | null;
  audio: { track_id: string; mode: "mix" | "replace"; file_path: string | null } | null;
};

const TARGET_SHORT = { w: 720, h: 1280 };
const TARGET_LONG = { w: 1280, h: 720 };

export async function handleEdit(job: Job): Promise<void> {
  if (!job.video_id) throw new Error("edit job missing video_id");
  const payload = job.payload as Payload;
  if (!payload.clips?.length) throw new Error("edit job has no clips");

  const workDir = join(tmpdir(), `streamhub-edit-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    // 1. Download each clip and trim/normalize to uniform codec + resolution.
    const target = payload.kind === "short" ? TARGET_SHORT : TARGET_LONG;
    const normalized: string[] = [];
    for (let i = 0; i < payload.clips.length; i++) {
      const clip = payload.clips[i];
      const src = join(workDir, `clip-${i}.bin`);
      await downloadFromBucket("videos", clip.source_path, src);
      const out = join(workDir, `norm-${i}.mp4`);
      await normalizeClip(src, out, clip.trim, target);
      normalized.push(out);
    }

    // 2. Concat (stream copy — all clips share the same codec/params).
    const concatOut = join(workDir, "concat.mp4");
    if (normalized.length === 1) {
      await runFfmpeg(["-i", normalized[0], "-c", "copy", "-movflags", "+faststart", concatOut]);
    } else {
      const listPath = join(workDir, "list.txt");
      await writeFile(listPath, normalized.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
      await runFfmpeg([
        "-f", "concat", "-safe", "0",
        "-i", listPath,
        "-c", "copy",
        "-movflags", "+faststart",
        concatOut,
      ]);
    }

    // 3. Apply overlay + audio if set, producing final.mp4.
    let audioFile: string | null = null;
    if (payload.audio && payload.audio.file_path) {
      audioFile = join(workDir, "track.bin");
      await downloadFromBucket("audio", payload.audio.file_path, audioFile);
    }

    const finalOut = join(workDir, "final.mp4");
    const combinedDuration = await probeVideo(concatOut).then((m) => m.duration);
    await applyOverlayAndAudio(concatOut, finalOut, audioFile, payload.overlay, payload.audio, combinedDuration);

    // 4. Upload and link.
    const newSourcePath = `${job.video_id}/source.mp4`;
    await uploadToBucket("videos", newSourcePath, finalOut, "video/mp4");
    const meta = await probeVideo(finalOut);
    await updateVideo(job.video_id, {
      source_path: newSourcePath,
      duration_seconds: meta.duration,
      width: meta.width,
      height: meta.height,
      status: "processing",
    });

    await supabase().from("processing_jobs").insert({
      kind: "transcode",
      video_id: job.video_id,
      payload: { source_path: newSourcePath, kind: payload.kind },
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function normalizeClip(
  src: string,
  dest: string,
  trim: { start: number; end: number },
  target: { w: number; h: number }
): Promise<void> {
  const duration = Math.max(0.1, trim.end - trim.start);
  await runFfmpeg([
    "-ss", String(trim.start),
    "-i", src,
    "-t", String(duration),
    "-vf",
    `scale=w=${target.w}:h=${target.h}:force_original_aspect_ratio=decrease,pad=${target.w}:${target.h}:(ow-iw)/2:(oh-ih)/2:black,fps=30`,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "160k",
    "-ar", "48000",
    "-ac", "2",
    "-movflags", "+faststart",
    dest,
  ]);
}

async function applyOverlayAndAudio(
  src: string,
  dest: string,
  audioFile: string | null,
  overlay: Payload["overlay"],
  audio: Payload["audio"],
  duration: number
): Promise<void> {
  if (!overlay && !audioFile) {
    await runFfmpeg(["-i", src, "-c", "copy", dest]);
    return;
  }

  const args: string[] = ["-i", src];
  if (audioFile) args.push("-i", audioFile);

  if (overlay && overlay.end > overlay.start) {
    const t = escapeDrawtext(overlay.text);
    const from = Math.max(0, Math.min(duration, overlay.start));
    const to = Math.max(from, Math.min(duration, overlay.end));
    args.push(
      "-vf",
      `drawtext=text='${t}':fontcolor=white:fontsize=h/18:box=1:boxcolor=black@0.5:boxborderw=12:` +
        `x=(w-text_w)/2:y=h-(text_h*2):enable='between(t,${from.toFixed(3)},${to.toFixed(3)})'`
    );
  }

  if (audioFile && audio) {
    if (audio.mode === "replace") {
      args.push("-map", "0:v:0", "-map", "1:a:0", "-shortest");
    } else {
      args.push(
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=shortest:dropout_transition=0[aout]",
        "-map", "0:v:0",
        "-map", "[aout]"
      );
    }
  }

  args.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    dest
  );

  await runFfmpeg(args);
}

function escapeDrawtext(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");
}
