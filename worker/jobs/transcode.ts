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

type Rung = { name: string; width: number; height: number; videoBitrate: string; audioBitrate: string; maxrate: string; bufsize: string };

const LADDER_LANDSCAPE: Rung[] = [
  { name: "360p", width: 640, height: 360, videoBitrate: "800k", audioBitrate: "96k", maxrate: "856k", bufsize: "1200k" },
  { name: "720p", width: 1280, height: 720, videoBitrate: "2500k", audioBitrate: "128k", maxrate: "2675k", bufsize: "3750k" },
  { name: "1080p", width: 1920, height: 1080, videoBitrate: "5000k", audioBitrate: "160k", maxrate: "5350k", bufsize: "7500k" },
];

async function transcodeLong(src: string, hlsDir: string): Promise<void> {
  // Probe to skip rungs that exceed the source resolution.
  const meta = await probeVideo(src);
  const sourceShort = Math.min(meta.width, meta.height);
  const rungs = LADDER_LANDSCAPE.filter((r) => r.height <= sourceShort || r === LADDER_LANDSCAPE[0]);

  // MP4 baseline at 720p for non-HLS fallback.
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

  // One FFmpeg invocation per rung → per-rung playlist + segments.
  for (const r of rungs) {
    await runFfmpeg([
      "-i", src,
      "-vf", `scale=w=${r.width}:h=${r.height}:force_original_aspect_ratio=decrease,pad=${r.width}:${r.height}:(ow-iw)/2:(oh-ih)/2`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-profile:v", "main",
      "-b:v", r.videoBitrate,
      "-maxrate", r.maxrate,
      "-bufsize", r.bufsize,
      "-g", "48",
      "-keyint_min", "48",
      "-sc_threshold", "0",
      "-c:a", "aac",
      "-b:a", r.audioBitrate,
      "-ac", "2",
      "-hls_time", "6",
      "-hls_playlist_type", "vod",
      "-hls_segment_filename", join(hlsDir, `${r.name}_%03d.ts`),
      join(hlsDir, `${r.name}.m3u8`),
    ]);
  }

  // Hand-write the master playlist.
  const master = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    ...rungs.flatMap((r) => {
      const bw = parseInt(r.videoBitrate, 10) * 1000 + parseInt(r.audioBitrate, 10) * 1000;
      return [
        `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${r.width}x${r.height},NAME="${r.name}"`,
        `${r.name}.m3u8`,
      ];
    }),
    "",
  ].join("\n");

  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(hlsDir, "master.m3u8"), master, "utf8");
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
