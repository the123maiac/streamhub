import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, service: "streamhub-web", time: new Date().toISOString() });
}
