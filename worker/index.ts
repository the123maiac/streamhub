import "dotenv/config";
import { claimJob, completeJob, failJob } from "./db";
import { handleTranscode } from "./jobs/transcode";
import { handleVodImport } from "./jobs/vod-import";

const POLL_INTERVAL_MS = 5000;
const WORKER_ID = `worker-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

async function tick(): Promise<void> {
  const job = await claimJob(WORKER_ID);
  if (!job) return;

  console.log(`[${WORKER_ID}] picked job ${job.id} kind=${job.kind}`);
  try {
    switch (job.kind) {
      case "transcode":
        await handleTranscode(job);
        break;
      case "vod_import":
        await handleVodImport(job);
        break;
      default:
        throw new Error(`unsupported job kind: ${job.kind}`);
    }
    await completeJob(job.id);
    console.log(`[${WORKER_ID}] finished job ${job.id}`);
  } catch (err) {
    console.error(`[${WORKER_ID}] job ${job.id} failed`, err);
    await failJob(job.id, err instanceof Error ? err.message : String(err));
  }
}

async function main(): Promise<void> {
  console.log(`[${WORKER_ID}] streamhub worker started`);
  process.on("SIGTERM", () => {
    console.log(`[${WORKER_ID}] shutting down`);
    process.exit(0);
  });

  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error(`[${WORKER_ID}] tick error`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
