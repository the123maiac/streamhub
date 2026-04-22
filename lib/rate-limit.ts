import { createServiceClient } from "@/lib/supabase/server";

type Bucket = { capacity: number; refillSeconds: number };

const BUCKETS: Record<string, Bucket> = {
  "chat:message": { capacity: 5, refillSeconds: 10 },
  "upload:video": { capacity: 10, refillSeconds: 24 * 60 * 60 },
  "stream:start": { capacity: 5, refillSeconds: 24 * 60 * 60 },
  "report:create": { capacity: 20, refillSeconds: 60 * 60 },
};

export async function consume(kind: keyof typeof BUCKETS, userId: string): Promise<boolean> {
  const cfg = BUCKETS[kind];
  if (!cfg) throw new Error(`unknown rate-limit bucket: ${kind}`);
  const key = `${kind}:${userId}`;
  const supabase = createServiceClient();

  const { data: row } = await supabase
    .from("rate_limit_buckets")
    .select("tokens, refilled_at")
    .eq("key", key)
    .maybeSingle();

  const now = new Date();
  let tokens = cfg.capacity;
  if (row) {
    const elapsed = (now.getTime() - new Date(row.refilled_at).getTime()) / 1000;
    const refill = Math.floor(elapsed / cfg.refillSeconds) * cfg.capacity;
    tokens = Math.min(cfg.capacity, row.tokens + refill);
  }
  if (tokens <= 0) return false;

  tokens -= 1;
  await supabase
    .from("rate_limit_buckets")
    .upsert({ key, tokens, refilled_at: now.toISOString() }, { onConflict: "key" });
  return true;
}
