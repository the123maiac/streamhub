import { readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { supabase } from "./db";

export async function downloadFromBucket(bucket: string, path: string, dest: string): Promise<void> {
  const { data, error } = await supabase().storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message ?? "unknown"}`);
  const buf = Buffer.from(await data.arrayBuffer());
  await writeFile(dest, buf);
}

export async function uploadToBucket(
  bucket: string,
  path: string,
  localFile: string,
  contentType: string
): Promise<void> {
  const body = await readFile(localFile);
  const { error } = await supabase().storage.from(bucket).upload(path, body, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`upload ${bucket}/${path}: ${error.message}`);
}

export async function uploadStreamToBucket(
  bucket: string,
  path: string,
  localFile: string,
  contentType: string
): Promise<void> {
  const stream = createReadStream(localFile);
  const { error } = await supabase().storage.from(bucket).upload(path, stream as unknown as Blob, {
    contentType,
    upsert: true,
    duplex: "half",
  } as unknown as { contentType: string; upsert: boolean });
  if (error) throw new Error(`upload (stream) ${bucket}/${basename(path)}: ${error.message}`);
}
