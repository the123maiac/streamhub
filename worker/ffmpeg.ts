import { spawn } from "node:child_process";

export type FfmpegArgs = string[];

export function runFfmpeg(args: FfmpegArgs): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

export function runFfprobe(args: FfmpegArgs): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", ["-hide_banner", "-loglevel", "error", ...args]);
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.stderr.on("data", (d) => (err += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`ffprobe exited ${code}: ${err}`));
    });
  });
}

export async function probeVideo(path: string): Promise<{
  duration: number;
  width: number;
  height: number;
}> {
  const out = await runFfprobe([
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,duration:format=duration",
    "-of",
    "json",
    path,
  ]);
  const data = JSON.parse(out);
  const stream = data.streams?.[0] ?? {};
  const duration = Number(stream.duration ?? data.format?.duration ?? 0);
  return {
    duration,
    width: Number(stream.width ?? 0),
    height: Number(stream.height ?? 0),
  };
}
