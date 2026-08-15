import type { DeskId, PacketNode } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function rows(raw: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = raw[key];
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function node(kind: string, id: string, label: string, status?: string, children?: PacketNode[]): PacketNode {
  return { kind, id, label, status, children: children?.length ? children : undefined };
}

/** Issue → control → test → asset. Same shape reused for txns and lots. */
export function packetFromRaw(raw: Record<string, unknown>, vertical: DeskId): PacketNode | undefined {
  if (vertical === "regulatory") {
    const issueId = text(raw.resourceId) ?? "issue";
    const issueName = text(raw["OPSS-Iss:Name"]) ?? issueId;
    const parentId = text(raw.parentControl);
    const controls = rows(raw, "relatedControls").map((row, index) =>
      node(
        "control",
        text(row.id) ?? `control-${index}`,
        text(row.id) ?? `Control ${index + 1}`,
        text(row.status) ?? (text(row.lastTested) ? `tested ${text(row.lastTested)}` : undefined)
      )
    );
    const assets = rows(raw, "assets").map((row, index) =>
      node(
        "asset",
        text(row.name) ?? `asset-${index}`,
        text(row.name) ?? `Asset ${index + 1}`,
        text(row.customersAffected) ? `${text(row.customersAffected)} customers` : undefined
      )
    );
    const controlBranch = parentId
      ? [node("control", parentId, parentId, text(raw.lastTested) ? `last tested ${text(raw.lastTested)}` : undefined, controls.filter((c) => c.id !== parentId))]
      : controls;
    return node("issue", issueId, issueName, text(raw["OPSS-Iss:Status"]), [...controlBranch, ...assets]);
  }

  if (vertical === "fraud") {
    const txns = rows(raw, "relatedTxns").map((row, index) =>
      node(
        "txn",
        `${text(row.when) ?? index}-${text(row.amount) ?? ""}`,
        [text(row.when), text(row.payee), text(row.amount)].filter(Boolean).join(" · ")
      )
    );
    if (txns.length === 0) return undefined;
    return node("alert", text(raw.alertId) ?? "alert", text(raw.policyName) ?? "Alert", undefined, txns);
  }

  if (vertical === "engineering") {
    const lots = rows(raw, "lots").map((row, index) =>
      node("lot", `${text(row.system) ?? index}`, `${text(row.system)} · lot ${text(row.lot)}`, text(row.lot))
    );
    if (lots.length === 0) return undefined;
    return node("event", text(raw.eventId) ?? "event", text(raw.summary) ?? "Deviation", undefined, lots);
  }

  return undefined;
}
