import { NextResponse } from "next/server";
import { draftActionStub, isHappyPath, reasonNotEligible } from "@/lib/actions";
import { TEMPLATE_MAP } from "@/lib/templates";
import type { CaseItem, DeskId } from "@/lib/types";

type DraftActionRequest = {
  item: CaseItem;
  templateId: DeskId;
};

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<DraftActionRequest>;
  const template = body.templateId ? TEMPLATE_MAP[body.templateId] : undefined;
  const item = body.item;

  if (!template || !item) {
    return NextResponse.json({ error: "Missing item or templateId." }, { status: 400 });
  }
  if (!isHappyPath(item)) {
    return NextResponse.json({ error: reasonNotEligible(item) }, { status: 422 });
  }

  // ANTHROPIC_API_KEY isn't wired in yet — every draft comes from the
  // deterministic stub until a real model call replaces this branch.
  const draftedAction = draftActionStub(item, template);

  return NextResponse.json({ draftedAction });
}
