import { mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Job } from "../db";
import { updateVideo } from "../db";
import { runFfmpeg, probeVideo } from "../ffmpeg";
import { downloadFromBucket, uploadToBucket } from "../storage";

type Payload = { source_path: string; kind: "short" | "long" };

export async function handleTranscode(job: Job): Promise<void> {
  if (!job.video_id) throw new Error("transcode job missing video_id");
  const payload = job.payload as Payload;

  const workDir = join(tmpdir(), `streamhub-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });

  try {
    const srcFile = join(workDir, "source.bin");
    await downloadFromBucket("videos", payload.source_path, srcFile);

    const meta = await probeVideo(srcFile);

    const hlsDir = join(workDir, "hls");
    const thumbFile = join(workDir, "thumb.jpg");
    await mkdir(hlsDir, { recursive: true });

    await generateThumbnail(srcFile, thumbFile);

    if (payload.kind === "short") {
      await transcodeShort(srcFile, hlsDir);
    } else {
      await transcodeLong(srcFile, hlsDir);
    }

    const basePath = `${job.video_id}/`;
    const thumbPath = `${basePath}thumb.jpg`;
    await uploadToBucket("thumbnails", thumbPath, thumbFile, "image/jpeg");

    const manifestRel = `${basePath}master.m3u8`;
    const mp4Rel = `${basePath}video.mp4`;
    await uploadHlsTree(hlsDir, basePath);

    await updateVideo(job.video_id, {
      status: "ready",
      hls_manifest_path: manifestRel,
      mp4_path: mp4Rel,
      thumbnail_path: thumbPath,
      duration_seconds: meta.duration,
      width: meta.width,
      height: meta.height,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function generateThumbnail(src: string, dest: string): Promise<void> {
  await runFfmpeg([
    "-ss", "2",
    "-i", src,
    "-frames:v", "1",
    "-vf", "scale='min(1280,iw)':-2",
    "-q:v", "3",
    dest,
  ]);
}

async function transcodeShort(src: string, hlsDir: string): Promise<void> {
  // Single rendition, vertical 720x1280 HLS + MP4 fallback.
  await runFfmpeg([
    "-i", src,
    "-vf", "scale='if(gt(a,9/16),-2,720)':'if(gt(a,9/16),1280,-2)',pad=720:1280:(ow-iw)/2:(oh-ih)/2:black",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    join(hlsDir, "video.mp4"),
  ]);

  await runFfmpeg([
    "-i", join(hlsDir, "video.mp4"),
    "-c", "copy",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", join(hlsDir, "seg_%03d.ts"),
    join(hlsDir, "master.m3u8"),
  ]);
}

async function transcodeLong(src: string, hlsDir: string): Promise<void> {
  // One MP4 baseline (for direct download/fallback) + 720p HLS.
  // Full adaptive ladder can land in Phase 2 — not worth the complexity for Phase 1.
  await runFfmpeg([
    "-i", src,
    "-vf", "scale='min(1280,iw)':-2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-c:a", "aac",
    "-b:a", "160k",
    "-movflags", "+faststart",
    join(hlsDir, "video.mp4"),
  ]);

  await runFfmpeg([
    "-i", join(hlsDir, "video.mp4"),
    "-c", "copy",
    "-hls_time", "6",
    "-hls_playlist_type", "vod",
    "-hls_segment_filename", join(hlsDir, "seg_%03d.ts"),
    join(hlsDir, "master.m3u8"),
  ]);
}

async function uploadHlsTree(hlsDir: string, remotePrefix: string): Promise<void> {
  const entries = await readdir(hlsDir);
  for (const entry of entries) {
    const local = join(hlsDir, entry);
    const remote = `${remotePrefix}${entry}`;
    const contentType = entry.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : entry.endsWith(".ts")
      ? "video/mp2t"
      : entry.endsWith(".mp4")
      ? "video/mp4"
      : "application/octet-stream";
    await uploadToBucket("hls", remote, local, contentType);
  }
}
