import { isNeedMore, packetAsks } from "./gaps";
import { overrideReview } from "./learn";
import { noteRequiredFor, assertDisposition, isClosedDisposition } from "./policy";
import { rankCases, type RankedCase } from "./ranking";
import { shiftClock } from "./shift";
import { TEMPLATE_MAP } from "./templates";
import { stageWriteback } from "./writeback";
import type {
  CaseItem,
  LoggedDisposition,
  ProcessCustomization,
  ProcessInstance,
} from "./types";

export type ChatIntent =
  | "refuse"
  | "help"
  | "why"
  | "priority"
  | "packet"
  | "hold"
  | "writeback"
  | "similar"
  | "next"
  | "shift"
  | "learn"
  | "owner"
  | "unknown";

export type ChatReply = {
  intent: ChatIntent;
  title: string;
  lines: string[];
  href?: string;
};

export type ChatWorld = {
  path: string;
  processes: ProcessInstance[];
  casesByProcess: Record<string, CaseItem[]>;
  ledger: LoggedDisposition[];
  customizations: Record<string, ProcessCustomization>;
};

type OpenRow = { process: ProcessInstance; row: RankedCase };

function norm(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

export function routeIntent(raw: string): ChatIntent {
  const q = norm(raw);
  if (!q) return "help";
  if (
    /auto[-\s]?clear|auto[-\s]?release|release (the |this )?(wire|funds|money|hold)|just dismiss|silent drop|approve ofac|clear the hold without|send the money/.test(
      q
    )
  ) {
    return "refuse";
  }
  if (/^(help|hi|hello|\?)$/.test(q) || /what can you|how do (i|you) use/.test(q)) return "help";
  if (/who owns|assigned|owner|park with/.test(q)) return "owner";
  if (/retune|override|weekly review|\blearn\b/.test(q)) return "learn";
  if (/shift|capacity|overflow|finish today|how many (can|will)/.test(q)) return "shift";
  if (/what (should|do) i (work|do|open)|next case|top of( the)? queue|what'?s next/.test(q)) {
    return "next";
  }
  if (/write[-\s]?back|what (gets |would you )?post|label|need_more|false_positive/.test(q)) {
    return "writeback";
  }
  if (/similar|false positive|noise|seen this|learn factor/.test(q)) return "similar";
  if (/need more|missing|packet|what('s| is) (missing|the ask)|thin|gap/.test(q)) return "packet";
  if (/hold|ofac|dismiss|can i (clear|close)|never auto/.test(q)) return "hold";
  if (/priorit|p1|p2|p3|\brank\b|why (first|now)|severity/.test(q)) return "priority";
  if (/why (this|here|flagged)|why is this|what is this/.test(q)) return "why";
  return "unknown";
}

function parsePath(path: string) {
  const parts = path.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  if (parts[0] === "p" && parts[1]) {
    return { processId: parts[1], caseId: parts[2] };
  }
  return {};
}

function processOf(world: ChatWorld, id: string) {
  return world.processes.find((p) => p.id === id);
}

function rankedFor(world: ChatWorld, process: ProcessInstance) {
  const template = TEMPLATE_MAP[process.templateId];
  const cases = world.casesByProcess[process.id] ?? template.cases;
  const ledger = world.ledger.filter((l) => l.processId === process.id);
  return {
    template,
    cases,
    ledger,
    ranked: rankCases(cases, template, world.customizations[process.id], ledger),
  };
}

function openRows(world: ChatWorld): OpenRow[] {
  const rows: OpenRow[] = [];
  for (const process of world.processes) {
    const { ranked, ledger } = rankedFor(world, process);
    const closed = new Set(
      ledger.filter((l) => isClosedDisposition(l.key)).map((l) => l.caseId)
    );
    for (const row of ranked) {
      if (row.collapsedInto || closed.has(row.item.id)) continue;
      rows.push({ process, row });
    }
  }
  rows.sort((a, b) => {
    if (a.row.policy.floor !== b.row.policy.floor) return a.row.policy.floor - b.row.policy.floor;
    return b.row.score - a.row.score;
  });
  return rows;
}

function findCase(world: ChatWorld, query: string): OpenRow | undefined {
  const loc = parsePath(world.path);
  if (loc.processId && loc.caseId) {
    const process = processOf(world, loc.processId);
    if (process) {
      const { ranked } = rankedFor(world, process);
      const row = ranked.find((r) => r.item.id === loc.caseId);
      if (row) return { process, row };
    }
  }
  const q = norm(query);
  const tokens = q.split(" ").filter((t) => t.length > 3);
  const all = openRows(world);
  if (loc.processId) {
    const here = all.filter((r) => r.process.id === loc.processId);
    const hit = here.find((r) => tokens.some((t) => r.row.item.title.toLowerCase().includes(t)));
    if (hit) return hit;
    if (here[0] && loc.caseId === undefined && (routeIntent(query) !== "next")) {
      return here[0];
    }
  }
  return all.find((r) =>
    tokens.some(
      (t) =>
        r.row.item.title.toLowerCase().includes(t) ||
        r.row.item.id.toLowerCase().includes(t) ||
        String(r.row.item.values.typology ?? "").toLowerCase().includes(t)
    )
  );
}

function labelOf(process: ProcessInstance, key: "act" | "monitor" | "dismiss") {
  return TEMPLATE_MAP[process.templateId].dispositions.find((d) => d.key === key)?.label ?? key;
}

function needCase(intent: ChatIntent): ChatReply {
  return {
    intent,
    title: "Open a case",
    lines: [
      "I only read the ranked queue. Open a case, or name it (OFAC, elder, mule).",
      "I do not guess a packet that is not in front of us.",
    ],
  };
}

function whyReply(hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const lines = [
    row.item.whyFlagged,
    `Lane: ${row.policy.hold ? "Hold" : row.policy.label}. Priority ${row.band}. Severity ${row.severity}.`,
    row.item.uncertainty,
  ];
  if (row.policy.hold) {
    lines.push("A hold is not a ticket. Desk will not auto-release it.");
  }
  return {
    intent: "why",
    title: row.item.title,
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function priorityReply(hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const lines = [
    `${row.band} from score ${row.score.toFixed(2)} inside lane floor ${row.policy.floor} (${row.policy.label}).`,
    `Severity is harm-if-true (${row.severity}), not look-now. Newest is not first.`,
  ];
  if (row.policy.floor === 0) {
    lines.push("This lane sits above weighted score, so ACH noise cannot bury it.");
  }
  if (isNeedMore(row.item)) {
    lines.push("Suggested action is Need more, not auto-act.");
  }
  return {
    intent: "priority",
    title: `${row.band} · ${row.item.title}`,
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function packetReply(hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const asks = packetAsks(row.item);
  const lines =
    asks.length > 0
      ? asks.map((a) => `${a.source === "missing-field" ? "Missing" : "Ask"}: ${a.ask}`)
      : ["No named asks. The packet is complete enough to decide, still a human call if money or a citation is in play."];
  if (isNeedMore(row.item)) {
    lines.push(`Use ${labelOf(process, "monitor")}. That posts a Need more label, not a clear.`);
  }
  return {
    intent: "packet",
    title: isNeedMore(row.item) ? "Need more" : "Packet",
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function holdReply(hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const blocked = assertDisposition("dismiss", row.policy, row.band, "");
  const lines = [
    row.policy.hold
      ? `${row.policy.label} is a hold. It cannot fall behind score.`
      : `Lane: ${row.policy.label}. Hold: ${row.policy.hold ? "yes" : "no"}.`,
  ];
  if (row.policy.neverAutoDismiss) {
    lines.push("Never auto-dismiss. A silent drop fails an exam.");
  }
  if (!blocked.ok) {
    lines.push(blocked.reason);
  } else if (noteRequiredFor("dismiss", row.policy, row.band)) {
    lines.push("A ledger note is required to dismiss.");
  } else {
    lines.push(`Dismiss is allowed as ${labelOf(process, "dismiss")} with a label, not a silent drop.`);
  }
  lines.push("I will not dismiss it for you.");
  return {
    intent: "hold",
    title: row.item.title,
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function writebackReply(hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const key = isNeedMore(row.item) ? "monitor" : "act";
  const staged = stageWriteback(row.item, key, "");
  if (!staged) {
    return {
      intent: "writeback",
      title: "No adapter mapping",
      lines: ["This template has no write-back spec. Desk still will not become the system of record."],
    };
  }
  const lines = [
    `Would POST ${staged.field}=${staged.value} to ${staged.destination} on ${staged.sourceRecordId}.`,
    "Kind: label. Overlay only. Never funds release.",
  ];
  if (staged.asks?.length) {
    lines.push(`Asks on the label: ${staged.asks.join("; ")}`);
  }
  return {
    intent: "writeback",
    title: staged.value,
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function similarReply(hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const s = row.similar;
  const lines = [
    `Same fingerprint: ${s.dismissed} cleared, ${s.monitored} Need more, ${s.acted} escalated.`,
  ];
  if (s.dismissed >= 3) {
    lines.push("Down-weighted for next time. Still in the queue. Not auto-cleared.");
  } else {
    lines.push("Not enough of a pattern to retune. Keep labeling.");
  }
  return {
    intent: "similar",
    title: row.item.title,
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function ownerReply(world: ChatWorld, hit: OpenRow): ChatReply {
  const { process, row } = hit;
  const parked = world.ledger.find(
    (l) => l.caseId === row.item.id && l.processId === process.id && l.key === "monitor"
  );
  if (parked?.owner) {
    return {
      intent: "owner",
      title: parked.owner,
      lines: [
        `Parked with ${parked.owner}. Still in the queue. Not done.`,
        "I will not reassign it. Change the owner on the case.",
      ],
      href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
    };
  }
  return {
    intent: "owner",
    title: "Unassigned",
    lines: [
      `${labelOf(process, "monitor")} needs a name. Need more stays in the queue until someone owns the asks.`,
    ],
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function nextReply(world: ChatWorld): ChatReply {
  const top = openRows(world)[0];
  if (!top) {
    return {
      intent: "next",
      title: "Queue is clear",
      lines: ["No open cases. Pull a feed or add a process."],
    };
  }
  const { process, row } = top;
  const lines = [
    `${row.policy.hold ? "Hold" : row.band} · ${row.policy.label}.`,
    row.item.whyFlagged,
  ];
  if (isNeedMore(row.item)) {
    const ask = packetAsks(row.item)[0];
    if (ask) lines.push(`Need more: ${ask.ask}`);
  }
  return {
    intent: "next",
    title: `Work next: ${row.item.title}`,
    lines,
    href: `/p/${process.id}/${encodeURIComponent(row.item.id)}`,
  };
}

function shiftReply(world: ChatWorld): ChatReply {
  const loc = parsePath(world.path);
  const process = (loc.processId && processOf(world, loc.processId)) || world.processes[0];
  if (!process) {
    return { intent: "shift", title: "No process", lines: ["Add a process first."] };
  }
  const { ranked, ledger } = rankedFor(world, process);
  const clock = shiftClock(ranked, ledger, world.customizations[process.id]?.shiftCapacity ?? 40);
  const lines = [
    `${clock.open} open · capacity ${clock.capacity} · ${clock.p1} P1 · ${clock.holds} hold${clock.holds === 1 ? "" : "s"}.`,
    clock.willFinish
      ? "This shift can finish the queue."
      : `You will not finish today (${clock.overflow} over). Holds still must: ${clock.mustHolds.map((h) => h.item.title).join(" · ") || "none"}.`,
  ];
  return { intent: "shift", title: process.name, lines, href: `/p/${process.id}` };
}

function learnReply(world: ChatWorld): ChatReply {
  const buckets = overrideReview(world.ledger, world.casesByProcess, world.processes);
  const retune = buckets.filter((b) => b.recommendation === "retune");
  const frozen = buckets.filter((b) => b.recommendation === "do-not-touch");
  if (buckets.length === 0) {
    return {
      intent: "learn",
      title: "Weekly override",
      lines: [
        "No labels yet. Work a queue, then Learn groups them by typology.",
        "Noise can retune a rule. Holds cannot.",
      ],
      href: "/learn",
    };
  }
  return {
    intent: "learn",
    title: "Weekly override",
    lines: [
      `${retune.length} retune candidate${retune.length === 1 ? "" : "s"}. ${frozen.length} do-not-touch.`,
      retune[0] ? `First retune: ${retune[0].label} (${retune[0].dismissed} clears, no true positives).` : "Nothing ready to retune.",
      "I will not auto-clear a hold from this review.",
    ],
    href: "/learn",
  };
}

/** Deterministic operator chat. No model. No dispositions. Labels and ranking only. */
export function answerChat(query: string, world: ChatWorld): ChatReply {
  const intent = routeIntent(query);

  if (intent === "refuse") {
    return {
      intent: "refuse",
      title: "Refused",
      lines: [
        "Desk will not auto-release a hold, funds, or a safety clear.",
        "Need more is a packet of asks. Dismiss still needs a human note on the ledger.",
      ],
    };
  }
  if (intent === "help") {
    return {
      intent: "help",
      title: "Ask Desk",
      lines: [
        "Deterministic. I only read ranking, policy, and the packet.",
        "Try: why this · what's missing · who owns this · can I dismiss · what posts back · what should I work.",
      ],
    };
  }
  if (intent === "next") return nextReply(world);
  if (intent === "shift") return shiftReply(world);
  if (intent === "learn") return learnReply(world);

  const hit = findCase(world, query);
  if (!hit && (intent === "why" || intent === "priority" || intent === "packet" || intent === "hold" || intent === "writeback" || intent === "similar" || intent === "owner")) {
    return needCase(intent);
  }
  if (intent === "why" && hit) return whyReply(hit);
  if (intent === "priority" && hit) return priorityReply(hit);
  if (intent === "packet" && hit) return packetReply(hit);
  if (intent === "hold" && hit) return holdReply(hit);
  if (intent === "writeback" && hit) return writebackReply(hit);
  if (intent === "similar" && hit) return similarReply(hit);
  if (intent === "owner" && hit) return ownerReply(world, hit);

  return {
    intent: "unknown",
    title: "Out of scope",
    lines: [
      "I do not generate advice. I report what ranking, policy, and the packet already decided.",
      "Try: why this, what's missing, can I dismiss, what posts back, what should I work.",
    ],
  };
}
