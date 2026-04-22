import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type JobKind = "transcode" | "thumbnail" | "edit" | "vod_import";

export type Job = {
  id: string;
  kind: JobKind;
  video_id: string | null;
  stream_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env vars not set for worker.");
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export async function claimJob(workerId: string): Promise<Job | null> {
  const sb = supabase();
  // Claim the oldest queued job atomically. No skip-locked here — at our scale,
  // serializable isolation via a narrow update is fine.
  const { data: claimed, error } = await sb.rpc("claim_processing_job", { p_worker: workerId });
  if (error) {
    throw new Error(`claim_processing_job: ${error.message}`);
  }
  if (!claimed || claimed.length === 0) return null;
  const row = claimed[0];
  return {
    id: row.id,
    kind: row.kind,
    video_id: row.video_id,
    stream_id: row.stream_id,
    payload: row.payload ?? {},
    attempts: row.attempts ?? 0,
  };
}

export async function completeJob(jobId: string): Promise<void> {
  const { error } = await supabase()
    .from("processing_jobs")
    .update({ status: "done", locked_by: null, locked_at: null })
    .eq("id", jobId);
  if (error) throw error;
}

export async function failJob(jobId: string, message: string): Promise<void> {
  const { error } = await supabase()
    .from("processing_jobs")
    .update({ status: "failed", error: message, locked_by: null, locked_at: null })
    .eq("id", jobId);
  if (error) throw error;
}

export async function updateVideo(videoId: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await supabase().from("videos").update(patch).eq("id", videoId);
  if (error) throw error;
}
