import { NextResponse } from "next/server";
import banking from "../../../../../data/examples/banking.json";
import engineering from "../../../../../data/examples/engineering.json";
import fraud from "../../../../../data/examples/fraud.json";
import regulatory from "../../../../../data/examples/regulatory-nested.json";

const FEEDS: Record<string, unknown> = {
  "core-banking": banking,
  openpages: regulatory,
  "tm-alerts": fraud,
  "plant-ops": engineering,
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ adapter: string }> }
) {
  const { adapter } = await ctx.params;
  const body = FEEDS[adapter];
  if (!body) {
    return NextResponse.json({ error: `No demo feed for ${adapter}` }, { status: 404 });
  }
  return NextResponse.json(body);
}
