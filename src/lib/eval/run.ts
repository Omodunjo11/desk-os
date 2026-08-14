import { ADAPTER_MAP } from "../adapters";
import { ingestPayload } from "../ingest";
import { ingestToCases } from "../pipeline";
import { assertDisposition, classifyPolicy } from "../policy";
import { rankCases } from "../ranking";
import { TEMPLATE_MAP } from "../templates";
import { stageWriteback } from "../writeback";
import { GOLD, type GoldCase } from "./gold";

export type Check = {
  goldId: string;
  name: string;
  pass: boolean;
  detail: string;
};

export type EvalReport = {
  passed: number;
  failed: number;
  checks: Check[];
};

function check(goldId: string, name: string, pass: boolean, detail: string): Check {
  return { goldId, name, pass, detail };
}

function runGold(gold: GoldCase): Check[] {
  const manifest = ADAPTER_MAP[gold.adapterId];
  if (!manifest) {
    return [check(gold.id, "adapter", false, `Unknown adapter ${gold.adapterId}`)];
  }

  if (gold.expectIngestError) {
    const parsed = ingestPayload(JSON.stringify(gold.raw), manifest.required);
    return [
      check(
        gold.id,
        "reject-thin-payload",
        !parsed.ok,
        parsed.ok ? "Accepted a record with no required fields" : parsed.errors.join("; ")
      ),
    ];
  }

  const result = ingestToCases(JSON.stringify(gold.raw), manifest);
  const item = result.cases[0];
  const expect = gold.expect;
  if (!expect) {
    return [check(gold.id, "expect", false, "Gold case has no expect block")];
  }
  if (!item) {
    return [check(gold.id, "ingest", false, result.errors.join("; ") || "No case produced")];
  }

  const checks: Check[] = [
    check(
      gold.id,
      "disposition",
      item.recommendedDisposition === expect.disposition,
      `got ${item.recommendedDisposition ?? "none"}, want ${expect.disposition}`
    ),
  ];

  if (expect.titleIncludes) {
    const hit = item.title.toLowerCase().includes(expect.titleIncludes.toLowerCase());
    checks.push(check(gold.id, "title", hit, item.title));
  }

  if (expect.minCoverage !== undefined) {
    const coverage = item.intakeCoverage ?? 0;
    checks.push(
      check(
        gold.id,
        "coverage",
        coverage >= expect.minCoverage,
        `coverage ${coverage}, want >= ${expect.minCoverage}`
      )
    );
  }

  if (expect.evidenceLabel) {
    const hit = item.evidence.some((row) =>
      row.label.toLowerCase().includes(expect.evidenceLabel!.toLowerCase())
    );
    checks.push(
      check(
        gold.id,
        "nested-evidence",
        hit,
        hit ? `found ${expect.evidenceLabel}` : item.evidence.map((e) => e.label).join(", ") || "none"
      )
    );
  }

  if (expect.hasNestedEvidence) {
    checks.push(
      check(
        gold.id,
        "package-depth",
        (item.facts?.length ?? 0) > 8,
        `${item.facts?.length ?? 0} facts`
      )
    );
  }

  if (expect.conflict) {
    const hit = (item.uncertainty ?? "").toLowerCase().includes("disagree");
    checks.push(check(gold.id, "conflict", hit, item.uncertainty ?? ""));
  }

  return checks;
}

function runPolicyChecks(): Check[] {
  const banking = TEMPLATE_MAP.banking;
  const ofac = banking.cases.find((c) => c.id === "bnk-wire-ofac");
  const ach = banking.cases.find((c) => c.id === "bnk-duplicate-ach");
  if (!ofac || !ach) {
    return [check("policy-floor", "seed", false, "Missing banking seed cases")];
  }

  const quietHold = {
    ...ofac,
    scores: { exposure: 0.08, urgency: 0.12, customer: 0.2, confidence: 0.95 },
    values: { ...ofac.values, amount: 12, sla: 72 },
    recencyHours: 40,
  };
  const loudAch = {
    ...ach,
    scores: { exposure: 0.96, urgency: 0.99, customer: 0.9, confidence: 0.95 },
    recencyHours: 0.2,
  };
  const ranked = rankCases([quietHold, loudAch], banking);
  const top = ranked[0];

  const policy = classifyPolicy(quietHold, banking);
  const blocked = assertDisposition("dismiss", policy, "P3", "");
  const allowed = assertDisposition(
    "dismiss",
    policy,
    "P3",
    "Address and tax id fail the second identifier."
  );
  const writeback = stageWriteback(quietHold, "monitor", "Need second identifier");

  const plant = TEMPLATE_MAP.engineering;
  const flooded = rankCases(plant.cases, plant);
  const master = flooded.find((row) => row.item.id === "eng-alarms");
  const sibling = flooded.find((row) => row.item.id === "eng-alarm-dp");

  return [
    check(
      "policy-floor",
      "ofac-before-ach-noise",
      top?.item.id === quietHold.id,
      ranked.map((row) => `${row.item.id}:${row.policy.label}`).join(" > ")
    ),
    check("policy-floor", "ofac-is-hold", Boolean(top?.policy.hold), top?.policy.label ?? "none"),
    check(
      "hold-guard",
      "dismiss-without-note",
      !blocked.ok,
      blocked.ok ? "allowed" : blocked.reason
    ),
    check(
      "hold-guard",
      "dismiss-with-note",
      allowed.ok,
      allowed.ok ? "allowed" : allowed.reason
    ),
    check(
      "writeback",
      "staged-label",
      Boolean(writeback?.value === "HOLD_PENDING_EVIDENCE" && writeback.overlayOnly),
      writeback ? `${writeback.destination} ${writeback.field}=${writeback.value}` : "none"
    ),
    check(
      "alarm-flood",
      "collapse-siblings",
      (master?.floodCount ?? 0) >= 3 && sibling?.collapsedInto === "eng-alarms",
      `master ${master?.floodCount ?? 0}, sibling → ${sibling?.collapsedInto ?? "none"}`
    ),
  ];
}

export function runEval(): EvalReport {
  const checks = [...GOLD.flatMap(runGold), ...runPolicyChecks()];
  return {
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
  };
}

export function formatReport(report: EvalReport) {
  const lines = [
    `Desk eval  ${report.passed} passed / ${report.failed} failed / ${report.checks.length} checks`,
    "",
  ];
  for (const row of report.checks) {
    lines.push(`${row.pass ? "PASS" : "FAIL"}  ${row.goldId}  ${row.name}  ${row.detail}`);
  }
  return lines.join("\n");
}

const isMain = process.argv[1]?.includes("eval/run");
if (isMain) {
  const report = runEval();
  console.log(formatReport(report));
  process.exit(report.failed > 0 ? 1 : 0);
}
