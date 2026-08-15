import { NextResponse } from "next/server";
import { getWorkspace, putWorkspace } from "@/lib/server-memory";
import type { WorkspaceSnapshot } from "@/lib/types";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const row = getWorkspace(id);
  if (!row || row.key !== key) {
    return NextResponse.json({ error: "Workspace not found or key mismatch." }, { status: 404 });
  }
  return NextResponse.json({ id: row.id, name: row.name, snapshot: row.snapshot, updatedAt: row.updatedAt });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { key?: string; snapshot?: WorkspaceSnapshot; name?: string };
  const row = getWorkspace(id);
  if (!row || row.key !== body.key) {
    return NextResponse.json({ error: "Workspace not found or key mismatch." }, { status: 404 });
  }
  if (!body.snapshot?.processes?.length) {
    return NextResponse.json({ error: "snapshot required" }, { status: 400 });
  }
  const next = {
    ...row,
    name: body.name?.trim() || row.name,
    snapshot: body.snapshot,
    updatedAt: new Date().toISOString(),
  };
  putWorkspace(next);
  return NextResponse.json({ ok: true, updatedAt: next.updatedAt });
}
