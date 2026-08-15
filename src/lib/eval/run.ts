import { ADAPTER_MAP } from "../adapters";
import { isSafePullUrl } from "../connectors";
import { ingestPayload } from "../ingest";
import { ingestToCases } from "../pipeline";
import { packetFromRaw } from "../packet";
import { mergePolicyRules, assertDisposition, assertPark, classifyPolicy, isClosedDisposition } from "../policy";
import { rankCases } from "../ranking";
import { shiftClock } from "../shift";
import { TEMPLATE_MAP } from "../templates";
import { stageWriteback } from "../writeback";
import { formatOverridePack, overrideReview, sampleWeekPlan } from "../learn";
import { asksAreOperatorLanguage, isNeedMore, packetAsks } from "../gaps";
import { answerChat, routeIntent } from "../chat";
import type { LoggedDisposition, ProcessInstance } from "../types";
import { GOLD, type GoldCase } from "./gold";
import { HOLD_GOLD } from "./holds";

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

  checks.push(
    check(
      gold.id,
      "never-auto-dismiss",
      item.recommendedDisposition !== "dismiss" || gold.expect?.disposition === "dismiss",
      `got ${item.recommendedDisposition}`
    )
  );

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

function runBoardChecks(): Check[] {
  const banking = TEMPLATE_MAP.banking;
  const emptied = mergePolicyRules(banking, { policyRules: [] });
  const stillHold = emptied.some((rule) => rule.id === "sanctions-hold" && rule.neverAutoDismiss);

  const withoutHold = mergePolicyRules(banking, {
    policyRules: [
      {
        id: "sanctions-hold",
        label: "Ignore OFAC",
        floor: 40,
        hold: false,
        neverAutoDismiss: false,
        match: { titleIncludes: ["nope"] },
      },
    ],
  });
  const locked = withoutHold.find((rule) => rule.id === "sanctions-hold");

  const plant = TEMPLATE_MAP.engineering;
  const clock = shiftClock(rankCases(plant.cases, plant), [], 3);

  const nested = {
    resourceId: "ISS-10442",
    "OPSS-Iss:Name": "CFPB circular — AI adverse-action notices",
    parentControl: "C-AA-12",
    lastTested: "2025-11-12",
    "OPSS-Iss:Status": "New",
    relatedControls: [
      { id: "C-AA-12", lastTested: "2025-11-12", status: "Stale" },
      { id: "C-AA-09", lastTested: "2026-01-04", status: "Current" },
    ],
    assets: [{ name: "AA-AUTO-001", customersAffected: 18400 }],
  };
  const tree = packetFromRaw(nested, "regulatory");
  const blocked = isSafePullUrl("https://169.254.169.254/latest", "https://desk.example");
  const demo = isSafePullUrl("/api/feeds/openpages", "https://desk.example");

  return [
    check("locked-policy", "cannot-drop-ofac", stillHold, emptied.map((r) => r.id).join(",")),
    check(
      "locked-policy",
      "cannot-weaken-hold",
      Boolean(locked?.hold && locked.neverAutoDismiss && locked.floor === 0),
      locked ? `${locked.label} floor ${locked.floor}` : "missing"
    ),
    check(
      "shift-clock",
      "overflow-names-holds",
      clock.overflow > 0 && clock.mustHolds.length >= 1 && !clock.willFinish,
      `overflow ${clock.overflow}, holds ${clock.mustHolds.length}`
    ),
    check(
      "openpages-tree",
      "issue-control-asset",
      Boolean(
        tree?.kind === "issue" &&
          tree.children?.some((c) => c.kind === "control") &&
          tree.children?.some((c) => c.kind === "asset")
      ),
      tree ? `${tree.kind} → ${(tree.children ?? []).map((c) => c.kind).join(",")}` : "none"
    ),
    check("connector", "block-metadata", !blocked.ok, blocked.ok ? "allowed" : blocked.reason),
    check("connector", "allow-demo-feed", demo.ok, demo.ok ? demo.href : demo.reason),
  ];
}

function runLearnChecks(): Check[] {
  const template = TEMPLATE_MAP.fraud;
  const process: ProcessInstance = {
    id: "proc-fraud",
    templateId: "fraud",
    name: "Fraud desk",
    operator: "TM analyst",
    createdAt: "2026-08-01T00:00:00Z",
  };
  const plan = sampleWeekPlan(process.id, template.cases);
  if (!plan) {
    return [check("learn", "sample-week-plan", false, "No mule typology on fraud seeds")];
  }

  const cases = [...template.cases, ...plan.extraCases.cases];
  const ledger: LoggedDisposition[] = plan.dispositions.map((op) => {
    const item = cases.find((c) => c.id === op.caseId);
    const policy = item ? classifyPolicy(item, template) : { id: "standard", label: "Standard" };
    return {
      caseId: op.caseId,
      processId: process.id,
      key: op.key,
      note: op.note,
      at: "2026-08-14T12:00:00Z",
      policyId: policy.id,
      policyLabel: policy.label,
    };
  });

  const buckets = overrideReview(ledger, { [process.id]: cases }, [process]);
  const mule = buckets.find((b) => b.key === "fraud:mule");
  const elder = buckets.find((b) => b.key.startsWith("fraud:elder"));
  const pack = JSON.parse(formatOverridePack(buckets, "2026-08-14T12:00:00Z")) as {
    retune: { suggestedLabel: string }[];
    doNotTouch: unknown[];
  };

  const elderCases = template.cases.filter((c) => String(c.values.typology).toLowerCase().includes("elder"));
  const dismissedElders: LoggedDisposition[] = elderCases.flatMap((item, i) =>
    [0, 1, 2].map((n) => ({
      caseId: item.id,
      processId: process.id,
      key: "dismiss" as const,
      note: `Forced clear ${n}`,
      at: `2026-08-0${i + 1}T0${n}:00:00Z`,
      policyId: "vulnerable-party",
      policyLabel: "Vulnerable party",
    }))
  );
  const frozen = overrideReview(dismissedElders, { [process.id]: elderCases }, [process]);

  return [
    check("learn", "sample-week-plan", plan.dispositions.filter((d) => d.key === "dismiss").length >= 3, `${plan.dispositions.length} ops`),
    check(
      "learn",
      "mule-noise-retune",
      mule?.recommendation === "retune" && (mule.dismissed ?? 0) >= 3 && mule.acted === 0,
      mule ? `${mule.recommendation} dismissed=${mule.dismissed}` : "missing mule bucket"
    ),
    check(
      "learn",
      "elder-do-not-touch",
      elder?.recommendation === "do-not-touch",
      elder ? `${elder.key} ${elder.recommendation}` : "missing elder bucket"
    ),
    check(
      "learn",
      "override-pack-fp-label",
      pack.retune.some((row) => row.suggestedLabel === "FALSE_POSITIVE") && pack.doNotTouch.length > 0,
      `retune ${pack.retune.length}, frozen ${pack.doNotTouch.length}`
    ),
    check(
      "learn",
      "dismissed-elder-still-frozen",
      frozen.length > 0 && frozen.every((b) => b.recommendation === "do-not-touch"),
      frozen.map((b) => `${b.key}:${b.recommendation}`).join(", ") || "empty"
    ),
  ];
}

function runPacketChecks(): Check[] {
  const banking = TEMPLATE_MAP.banking;
  const fraud = TEMPLATE_MAP.fraud;
  const ofac = banking.cases.find((c) => c.id === "bnk-wire-ofac");
  const vendor = fraud.cases.find((c) => c.id === "frd-false-pos");
  const elder = fraud.cases.find((c) => c.id === "frd-elder-billpay");
  const ofacAsks = ofac ? packetAsks(ofac) : [];
  const ofacWrite = ofac ? stageWriteback(ofac, "monitor", "") : undefined;

  const thin = ingestToCases(
    JSON.stringify({
      alertId: "A-thin-1",
      alertType: "ELDER_EXPLOITATION",
      policyName: "Elder account — new payees",
      focalParty: "Helen Ward, 78",
      narrative: "New bill-pay payees. The export omitted the next step and the open question.",
      txnAmountUsd: 14200,
      riskScore: 90,
    }),
    ADAPTER_MAP["tm-alerts"]
  ).cases[0];
  const thinAsks = thin ? packetAsks(thin) : [];

  const goldElder = ingestToCases(
    JSON.stringify(GOLD.find((g) => g.id === "fraud-elder-need-more")?.raw ?? {}),
    ADAPTER_MAP["tm-alerts"]
  ).cases[0];
  const elderAsks = goldElder ? packetAsks(goldElder) : [];
  const tmWrite = goldElder ? stageWriteback(goldElder, "monitor", "") : undefined;

  return [
    check(
      "packet",
      "ofac-second-identifier",
      Boolean(ofac && isNeedMore(ofac) && ofacAsks.some((a) => /second identifier/i.test(a.ask))),
      ofacAsks.map((a) => a.ask).join(" · ") || "none"
    ),
    check(
      "packet",
      "vendor-not-need-more",
      Boolean(vendor && !isNeedMore(vendor)),
      vendor ? `needMore=${isNeedMore(vendor)}` : "missing vendor"
    ),
    check(
      "packet",
      "elder-trusted-contact",
      Boolean(elderAsks.some((a) => /trusted contact/i.test(a.ask))),
      elderAsks.map((a) => a.ask).join(" · ") || "none"
    ),
    check(
      "packet",
      "thin-named-not-keys",
      Boolean(
        thin &&
          isNeedMore(thin) &&
          (thin.gaps?.length ?? 0) >= 2 &&
          thinAsks.some((a) => a.source === "missing-field") &&
          asksAreOperatorLanguage(thinAsks)
      ),
      thinAsks.map((a) => `${a.source}:${a.ask}`).join(" · ") || "none"
    ),
    check(
      "packet",
      "need-more-writeback-asks",
      Boolean(
        ofacWrite?.value === "HOLD_PENDING_EVIDENCE" &&
          ofacWrite.asks?.some((a) => /second identifier/i.test(a)) &&
          /Need more:/i.test(ofacWrite.note)
      ),
      ofacWrite ? `${ofacWrite.value} ${ofacWrite.note}` : "none"
    ),
    check(
      "packet",
      "seed-elder-need-more",
      Boolean(elder && isNeedMore(elder)),
      elder ? elder.id : "missing"
    ),
    check(
      "packet",
      "tm-need-more-label",
      Boolean(tmWrite?.value === "NEED_MORE" && (tmWrite.asks?.length ?? 0) > 0),
      tmWrite ? `${tmWrite.field}=${tmWrite.value}` : "none"
    ),
  ];
}

function seedWorld() {
  const processes: ProcessInstance[] = Object.values(TEMPLATE_MAP).map((t) => ({
    id: t.id,
    templateId: t.id,
    name: t.name,
    operator: t.operator,
    createdAt: "seed",
  }));
  return {
    processes,
    casesByProcess: Object.fromEntries(Object.values(TEMPLATE_MAP).map((t) => [t.id, t.cases])),
    ledger: [] as LoggedDisposition[],
    customizations: {},
  };
}

function runChatChecks(): Check[] {
  const base = seedWorld();
  const ofacPath = "/p/banking/bnk-wire-ofac";
  const refuse = answerChat("just dismiss the OFAC and auto-release the wire", {
    ...base,
    path: ofacPath,
  });
  const missing = answerChat("what's missing?", { ...base, path: ofacPath });
  const next = answerChat("what should I work?", { ...base, path: "/" });
  const unknown = answerChat("write a poem about wires", { ...base, path: ofacPath });
  const hold = answerChat("can I dismiss this?", { ...base, path: ofacPath });

  return [
    check("chat", "refuse-auto-release", refuse.intent === "refuse", refuse.title),
    check(
      "chat",
      "ofac-second-identifier",
      missing.intent === "packet" && missing.lines.some((l) => /second identifier/i.test(l)),
      missing.lines.join(" · ")
    ),
    check(
      "chat",
      "next-is-hold",
      next.intent === "next" && /ofac|sanctions|hold/i.test(next.title + next.lines.join(" ")),
      next.title
    ),
    check("chat", "no-generation", unknown.intent === "unknown", unknown.intent),
    check(
      "chat",
      "dismiss-needs-human",
      hold.intent === "hold" && hold.lines.some((l) => /will not dismiss/i.test(l)),
      hold.lines.join(" · ")
    ),
    check("chat", "route-refuse", routeIntent("auto-clear this hold") === "refuse", routeIntent("auto-clear this hold")),
  ];
}

function runParkChecks(): Check[] {
  const banking = TEMPLATE_MAP.banking;
  const ofac = banking.cases.find((c) => c.id === "bnk-wire-ofac");
  const ranked = rankCases(banking.cases, banking);
  const openAll = shiftClock(ranked, [], 40).open;
  const parked: LoggedDisposition[] = ofac
    ? [
        {
          caseId: ofac.id,
          processId: "banking",
          key: "monitor",
          note: "Need second identifier",
          at: "2026-08-15T00:00:00Z",
          owner: "Priya RM",
        },
      ]
    : [];
  const afterPark = shiftClock(ranked, parked, 40).open;
  const afterClear = shiftClock(
    ranked,
    ofac
      ? [{ caseId: ofac.id, processId: "banking", key: "dismiss", note: "cleared", at: "2026-08-15T00:00:00Z" }]
      : [],
    40
  ).open;
  const unnamed = assertPark("monitor", "");
  const named = assertPark("monitor", "Priya RM");
  const actOk = assertPark("act", "");
  const owned = answerChat("who owns this?", {
    ...seedWorld(),
    path: "/p/banking/bnk-wire-ofac",
    ledger: parked,
  });

  return [
    check("park", "needs-owner", !unnamed.ok, unnamed.ok ? "allowed" : unnamed.reason),
    check("park", "named-owner", named.ok, named.ok ? "allowed" : named.reason),
    check("park", "act-without-owner", actOk.ok, actOk.ok ? "allowed" : actOk.reason),
    check("park", "stays-open", Boolean(ofac && afterPark === openAll && !isClosedDisposition("monitor")), `open ${afterPark} vs ${openAll}`),
    check("park", "dismiss-closes", afterClear === openAll - 1, `open ${afterClear} vs ${openAll - 1}`),
    check(
      "park",
      "chat-owner",
      owned.intent === "owner" && owned.title === "Priya RM",
      `${owned.intent} ${owned.title}`
    ),
  ];
}

export function runEval(): EvalReport {
  const holdChecks = HOLD_GOLD.flatMap(runGold).concat(
    HOLD_GOLD.flatMap((gold) => {
      const result = ingestToCases(JSON.stringify(gold.raw), ADAPTER_MAP[gold.adapterId]);
      const item = result.cases[0];
      return [
        check(
          gold.id,
          "must-never-dismiss",
          item?.recommendedDisposition !== "dismiss",
          `got ${item?.recommendedDisposition ?? "none"}`
        ),
      ];
    })
  );
  const checks = [...GOLD.flatMap(runGold), ...holdChecks, ...runPolicyChecks(), ...runBoardChecks(), ...runLearnChecks(), ...runPacketChecks(), ...runChatChecks(), ...runParkChecks()];
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
