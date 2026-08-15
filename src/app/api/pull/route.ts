import { NextResponse } from "next/server";
import { isSafePullUrl } from "@/lib/connectors";

export async function POST(req: Request) {
  const body = (await req.json()) as { url?: string };
  const origin = new URL(req.url).origin;
  if (!body.url) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }
  const safe = isSafePullUrl(body.url, origin);
  if (!safe.ok) {
    return NextResponse.json({ error: safe.reason }, { status: 400 });
  }
  const res = await fetch(safe.href, { headers: { accept: "application/json,text/plain" } });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Upstream ${res.status}`, text }, { status: 502 });
  }
  return NextResponse.json({ text });
}
