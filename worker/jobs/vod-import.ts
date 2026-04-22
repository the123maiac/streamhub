import type { Job } from "../db";

export async function handleVodImport(_job: Job): Promise<void> {
  // Placeholder — implemented in Phase 3 when livestream lands.
  // Will: pull recording URL from Livepeer API, download, enqueue a transcode for the VOD,
  // and link streams.vod_video_id back to the new videos row.
  throw new Error("vod_import handler not implemented yet (Phase 3)");
}
