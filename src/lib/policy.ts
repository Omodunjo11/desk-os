import type {
  CaseItem,
  DeskId,
  DispositionKey,
  PolicyHit,
  PolicyMatch,
  PolicyRule,
  PriorityBand,
  ProcessTemplate,
} from "./types";

const STANDARD: PolicyHit = {
  id: "standard",
  label: "Standard",
  floor: 50,
  hold: false,
  neverAutoDismiss: false,
};

export const POLICY_BY_TEMPLATE: Record<DeskId, PolicyRule[]> = {
  banking: [
    {
      id: "sanctions-hold",
      label: "Sanctions hold",
      floor: 0,
      hold: true,
      neverAutoDismiss: true,
      match: {
        titleIncludes: ["ofac", "sanctions", "sdn", "near-match"],
      },
    },
    {
      id: "payroll-window",
      label: "Payroll window",
      floor: 1,
      hold: false,
      neverAutoDismiss: true,
      match: {
        titleIncludes: ["payroll"],
      },
    },
    {
      id: "wire-cutoff",
      label: "Wire cutoff",
      floor: 2,
      hold: false,
      neverAutoDismiss: false,
      match: {
        valueEquals: { key: "product", anyOf: ["Wire"] },
      },
    },
  ],
  regulatory: [
    {
      id: "exam-mria",
      label: "Exam / MRIA",
      floor: 0,
      hold: true,
      neverAutoDismiss: true,
      match: { titleIncludes: ["mria", "exam"] },
    },
    {
      id: "critical-citation",
      label: "Critical citation",
      floor: 1,
      hold: false,
      neverAutoDismiss: true,
      match: { scoreAtLeast: { key: "harm", min: 0.85 } },
    },
  ],
  fraud: [
    {
      id: "vulnerable-party",
      label: "Vulnerable party",
      floor: 0,
      hold: false,
      neverAutoDismiss: true,
      match: {
        titleIncludes: ["elder", "exploit"],
        valueIncludes: { key: "typology", anyOf: ["elder"] },
      },
    },
    {
      id: "high-harm-thin",
      label: "High harm",
      floor: 1,
      hold: false,
      neverAutoDismiss: true,
      match: { scoreAtLeast: { key: "harm", min: 0.85 } },
    },
  ],
  engineering: [
    {
      id: "quality-hold",
      label: "Quality hold",
      floor: 0,
      hold: true,
      neverAutoDismiss: true,
      match: {
        titleIncludes: ["genealogy", "mismatch"],
        valueIncludes: { key: "type", anyOf: ["hold"] },
      },
    },
    {
      id: "safety-critical",
      label: "Safety critical",
      floor: 0,
      hold: true,
      neverAutoDismiss: true,
      match: { scoreAtLeast: { key: "safety", min: 0.85 } },
    },
    {
      id: "alarm-flood",
      label: "Alarm flood",
      floor: 1,
      hold: false,
      neverAutoDismiss: false,
      match: {
        titleIncludes: ["alarm flood", "isa"],
        valueEquals: { key: "type", anyOf: ["Alarm"] },
      },
    },
  ],
};

function includesAny(haystack: string, needles: string[]) {
  const text = haystack.toLowerCase();
  return needles.some((n) => text.includes(n.toLowerCase()));
}

function matchRule(item: CaseItem, match: PolicyMatch): boolean {
  const clauses: boolean[] = [];

  if (match.titleIncludes?.length) {
    clauses.push(includesAny(item.title, match.titleIncludes));
  }
  if (match.subjectIncludes?.length) {
    clauses.push(includesAny(item.subject, match.subjectIncludes));
  }
  if (match.valueEquals) {
    const raw = String(item.values[match.valueEquals.key] ?? "");
    clauses.push(
      match.valueEquals.anyOf.some((v) => raw.toLowerCase() === v.toLowerCase())
    );
  }
  if (match.valueIncludes) {
    const raw = String(item.values[match.valueIncludes.key] ?? "");
    clauses.push(includesAny(raw, match.valueIncludes.anyOf));
  }
  if (match.scoreAtLeast) {
    const value = item.scores[match.scoreAtLeast.key] ?? 0;
    clauses.push(value >= match.scoreAtLeast.min);
  }

  if (clauses.length === 0) return false;
  return clauses.some(Boolean);
}

export function lockedRuleIds(template: ProcessTemplate): string[] {
  return (POLICY_BY_TEMPLATE[template.id] ?? [])
    .filter((rule) => rule.neverAutoDismiss)
    .map((rule) => rule.id);
}

export function isLockedRule(ruleId: string, template: ProcessTemplate) {
  return lockedRuleIds(template).includes(ruleId);
}

/**
 * Custom lanes can be added and reordered.
 * System holds keep their matcher, hold flag, never-auto-dismiss, and floor.
 */
export function mergePolicyRules(
  template: ProcessTemplate,
  custom?: { policyRules?: PolicyRule[] }
): PolicyRule[] {
  const system = template.policyRules ?? POLICY_BY_TEMPLATE[template.id] ?? [];
  const locked = new Set(lockedRuleIds(template));
  if (!custom?.policyRules?.length) return system;

  const overlay = new Map(custom.policyRules.map((rule) => [rule.id, rule]));
  const merged = system.map((sys) => {
    const next = overlay.get(sys.id);
    if (!next) return sys;
    if (locked.has(sys.id)) {
      return { ...sys, label: next.label.trim() || sys.label };
    }
    return next;
  });
  const extras = custom.policyRules.filter((rule) => !system.some((sys) => sys.id === rule.id));
  return [...merged, ...extras].sort((a, b) => a.floor - b.floor || a.label.localeCompare(b.label));
}

export function rulesFor(
  template: ProcessTemplate,
  custom?: { policyRules?: PolicyRule[] }
): PolicyRule[] {
  return mergePolicyRules(template, custom);
}

export function classifyPolicy(
  item: CaseItem,
  template: ProcessTemplate,
  custom?: { policyRules?: PolicyRule[] }
): PolicyHit {
  const hits = rulesFor(template, custom)
    .filter((rule) => matchRule(item, rule.match))
    .sort((a, b) => a.floor - b.floor);
  const hit = hits[0];
  if (!hit) return STANDARD;
  return {
    id: hit.id,
    label: hit.label,
    floor: hit.floor,
    hold: hit.hold,
    neverAutoDismiss: hit.neverAutoDismiss,
  };
}

/**
 * Holds and exam/safety lanes never auto-clear.
 * Need more (monitor) is the honest output when the packet is thin.
 */
export function applyPolicyToDisposition(
  recommended: DispositionKey,
  policy: PolicyHit
): DispositionKey {
  if (policy.neverAutoDismiss && recommended === "dismiss") return "monitor";
  return recommended;
}

export function noteRequiredFor(
  key: DispositionKey,
  policy: PolicyHit,
  band: PriorityBand
) {
  if (key !== "dismiss") return false;
  return policy.hold || policy.neverAutoDismiss || band === "P1";
}

/** Act and dismiss leave the open queue. Need more / park stays in it. */
export function isClosedDisposition(key: DispositionKey) {
  return key !== "monitor";
}

export function assertPark(key: DispositionKey, owner: string) {
  if (key !== "monitor") return { ok: true as const };
  if (owner.trim().length > 0) return { ok: true as const };
  return {
    ok: false as const,
    reason: "Park with owner needs a name. Need more stays in the queue.",
  };
}

export function assertDisposition(
  key: DispositionKey,
  policy: PolicyHit,
  band: PriorityBand,
  note: string
): { ok: true } | { ok: false; reason: string } {
  if (!noteRequiredFor(key, policy, band)) return { ok: true };
  if (note.trim().length > 0) return { ok: true };
  if (policy.hold) {
    return {
      ok: false,
      reason:
        "This is a hold, not a ticket. A note is required before it can leave the queue. Silent drop fails an exam.",
    };
  }
  if (policy.neverAutoDismiss) {
    return {
      ok: false,
      reason: `${policy.label} cannot be cleared without a reason on the ledger.`,
    };
  }
  return {
    ok: false,
    reason: "Dismissing a P1 case needs a note explaining why before it clears.",
  };
}
