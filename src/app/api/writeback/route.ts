import { NextResponse } from "next/server";
import { listLabels, pushLabel } from "@/lib/server-memory";

export async function GET() {
  return NextResponse.json({ labels: listLabels() });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  if (body.kind && body.kind !== "label") {
    return NextResponse.json(
      { error: "Refused: Desk only accepts labels, never money movement or safety-clear commands." },
      { status: 400 }
    );
  }
  const field = String(body.field ?? "");
  const value = String(body.value ?? "");
  if (!field || !value) {
    return NextResponse.json({ error: "field and value required" }, { status: 400 });
  }
  pushLabel({
    at: new Date().toISOString(),
    payload: {
      kind: "label",
      destination: String(body.destination ?? "unknown"),
      sourceRecordId: String(body.sourceRecordId ?? ""),
      field,
      value,
      note: String(body.note ?? ""),
      overlayOnly: true,
      asks: Array.isArray(body.asks)
        ? body.asks.filter((row): row is string => typeof row === "string" && row.trim().length > 0)
        : undefined,
    },
  });
  return NextResponse.json({ ok: true, status: "posted" });
}
