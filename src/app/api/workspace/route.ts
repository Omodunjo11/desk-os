import { NextResponse } from "next/server";
import { putWorkspace } from "@/lib/server-memory";
import type { WorkspaceSnapshot } from "@/lib/types";

function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function newKey() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function POST(req: Request) {
  const body = (await req.json()) as { name?: string; snapshot?: WorkspaceSnapshot };
  if (!body.snapshot?.processes?.length) {
    return NextResponse.json({ error: "snapshot.processes required" }, { status: 400 });
  }
  const id = newId();
  const key = newKey();
  putWorkspace({
    id,
    key,
    name: body.name?.trim() || "Desk workspace",
    snapshot: body.snapshot,
    updatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ id, key, name: body.name?.trim() || "Desk workspace" });
}
