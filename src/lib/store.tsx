"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { sampleWeekPlan } from "./learn";
import { rankCases } from "./ranking";
import { TEMPLATES, TEMPLATE_MAP } from "./templates";
import { assertDisposition, assertPark } from "./policy";
import { postWriteback, stageWriteback } from "./writeback";
import { DEMO_FEEDS, pullToCases } from "./connectors";
import { ADAPTERS } from "./adapters";
import type {
  CaseItem,
  DeskId,
  DispositionKey,
  DisposeResult,
  LoggedDisposition,
  ProcessCustomization,
  ProcessInstance,
  ProcessTemplate,
  WorkspaceMeta,
  WorkspaceSnapshot,
} from "./types";

const STORAGE_KEY = "desk-os-v3";

type StoreShape = WorkspaceSnapshot & {
  workspace?: WorkspaceMeta;
};

function defaultProcesses(): ProcessInstance[] {
  return TEMPLATES.map((t) => ({
    id: t.id,
    templateId: t.id,
    name: t.name,
    operator: t.operator,
    createdAt: "seed",
  }));
}

export function emptyCustom(template: ProcessTemplate): ProcessCustomization {
  const adapterId =
    ADAPTERS.find((adapter) => adapter.defaultTemplateId === template.id)?.id ?? template.adapter.id;
  return {
    hiddenFields: [],
    weights: Object.fromEntries(template.rankingInputs.map((i) => [i.key, i.weight])),
    dispositionLabels: Object.fromEntries(
      template.dispositions.map((d) => [d.key, d.label])
    ) as ProcessCustomization["dispositionLabels"],
    writebackEnabled: true,
    writebackUrl: "/api/writeback",
    shiftCapacity: 40,
    connector: {
      adapterId,
      url: DEMO_FEEDS[adapterId] ?? "",
    },
  };
}

function seedCases(): Record<string, CaseItem[]> {
  return Object.fromEntries(TEMPLATES.map((t) => [t.id, t.cases.map((c) => ({ ...c }))]));
}

function cloneCases(processId: string, templateId: DeskId): CaseItem[] {
  return TEMPLATE_MAP[templateId].cases.map((item) => ({
    ...item,
    id: `${processId}:${item.id}`,
    values: { ...item.values },
    scores: { ...item.scores },
    evidence: item.evidence.map((e) => ({ ...e })),
  }));
}

function emptyStore(): StoreShape {
  return {
    processes: defaultProcesses(),
    customizations: {},
    ledger: [],
    casesByProcess: seedCases(),
  };
}

function snapshotOf(s: StoreShape): WorkspaceSnapshot {
  return {
    processes: s.processes,
    customizations: s.customizations,
    ledger: s.ledger,
    casesByProcess: s.casesByProcess,
  };
}

function load(): StoreShape {
  const fallback = emptyStore();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem("desk-os-v2");
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.processes?.length) return fallback;
    return {
      processes: parsed.processes,
      customizations: parsed.customizations ?? {},
      ledger: parsed.ledger ?? [],
      casesByProcess: { ...fallback.casesByProcess, ...(parsed.casesByProcess ?? {}) },
      workspace: parsed.workspace,
    };
  } catch {
    return fallback;
  }
}

type DeskStore = StoreShape & {
  ready: boolean;
  addProcess: (templateId: DeskId, name: string) => string;
  removeProcess: (id: string) => void;
  customize: (processId: string, patch: Partial<ProcessCustomization>) => void;
  resetCustom: (processId: string) => void;
  ingestCases: (processId: string, cases: CaseItem[], mode?: "append" | "replace") => void;
  dispose: (processId: string, caseId: string, key: DispositionKey, note?: string, owner?: string) => DisposeResult;
  publishWriteback: (entry: LoggedDisposition) => Promise<LoggedDisposition>;
  pullConnector: (processId: string) => Promise<{ ok: boolean; count: number; error?: string }>;
  shareWorkspace: (name?: string) => Promise<WorkspaceMeta>;
  joinWorkspace: (id: string, key: string) => Promise<{ ok: boolean; error?: string }>;
  leaveWorkspace: () => void;
  applySampleWeek: () => { ok: boolean; count: number; error?: string };
  reopen: (caseId: string) => void;
  resetAll: () => void;
};

const Ctx = createContext<DeskStore | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreShape>(emptyStore);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loaded = load();
    setState(loaded);
    setReady(true);
    const params = new URLSearchParams(window.location.search);
    const ws = params.get("ws");
    const key = params.get("k");
    if (ws && key) {
      void fetch(`/api/workspace/${ws}?key=${encodeURIComponent(key)}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data?.snapshot) return;
          setState({
            ...data.snapshot,
            workspace: { id: ws, key, name: data.name ?? "Shared desk" },
          });
        })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, ready]);

  useEffect(() => {
    if (!ready || !state.workspace) return;
    const { id, key, name } = state.workspace;
    const t = window.setTimeout(() => {
      void fetch(`/api/workspace/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, name, snapshot: snapshotOf(state) }),
      });
    }, 900);
    return () => window.clearTimeout(t);
  }, [state, ready]);

  const addProcess = useCallback((templateId: DeskId, name: string) => {
    const template = TEMPLATE_MAP[templateId];
    const id = `${templateId}-${Date.now().toString(36)}`;
    setState((s) => ({
      ...s,
      processes: [
        ...s.processes,
        {
          id,
          templateId,
          name: name.trim() || `${template.name} (copy)`,
          operator: template.operator,
          createdAt: new Date().toISOString(),
        },
      ],
      casesByProcess: {
        ...s.casesByProcess,
        [id]: cloneCases(id, templateId),
      },
    }));
    return id;
  }, []);

  const removeProcess = useCallback((id: string) => {
    if (TEMPLATES.some((t) => t.id === id)) return;
    setState((s) => {
      const casesByProcess = { ...s.casesByProcess };
      delete casesByProcess[id];
      return {
        ...s,
        processes: s.processes.filter((p) => p.id !== id),
        ledger: s.ledger.filter((l) => l.processId !== id),
        casesByProcess,
      };
    });
  }, []);

  const customize = useCallback((processId: string, patch: Partial<ProcessCustomization>) => {
    setState((s) => {
      const process = s.processes.find((p) => p.id === processId);
      if (!process) return s;
      const current = s.customizations[processId] ?? emptyCustom(TEMPLATE_MAP[process.templateId]);
      return {
        ...s,
        customizations: {
          ...s.customizations,
          [processId]: { ...current, ...patch },
        },
      };
    });
  }, []);

  const resetCustom = useCallback((processId: string) => {
    setState((s) => {
      const next = { ...s.customizations };
      delete next[processId];
      return { ...s, customizations: next };
    });
  }, []);

  const ingestCases = useCallback(
    (processId: string, cases: CaseItem[], mode: "append" | "replace" = "append") => {
      setState((s) => {
        const existing = s.casesByProcess[processId] ?? [];
        const incoming = cases.map((item) => ({
          ...item,
          id: item.id.startsWith(`${processId}:`) ? item.id : `${processId}:${item.id}`,
          values: { ...item.values },
          scores: { ...item.scores },
          evidence: item.evidence.map((e) => ({ ...e })),
          packet: item.packet,
        }));
        const merged =
          mode === "replace"
            ? incoming
            : [...existing.filter((row) => !incoming.some((next) => next.id === row.id)), ...incoming];
        return {
          ...s,
          casesByProcess: { ...s.casesByProcess, [processId]: merged },
        };
      });
    },
    []
  );

  const dispose = useCallback(
    (processId: string, caseId: string, key: DispositionKey, note = "", owner = ""): DisposeResult => {
      let result: DisposeResult = { ok: false, reason: "Process or case not found." };
      setState((s) => {
        const process = s.processes.find((p) => p.id === processId);
        if (!process) return s;
        const template = TEMPLATE_MAP[process.templateId];
        const custom = s.customizations[processId];
        const cases = s.casesByProcess[processId] ?? template.cases;
        const item = cases.find((c) => c.id === caseId);
        if (!item) return s;
        const ranked = rankCases(
          cases,
          template,
          custom,
          s.ledger.filter((l) => l.processId === processId)
        );
        const row = ranked.find((r) => r.item.id === caseId);
        const policy = row?.policy;
        if (!policy) return s;
        const gate = assertDisposition(key, policy, row.band, note);
        if (!gate.ok) {
          result = gate;
          return s;
        }
        const park = assertPark(key, owner);
        if (!park.ok) {
          result = park;
          return s;
        }
        const named = owner.trim();
        const entry: LoggedDisposition = {
          caseId,
          processId,
          key,
          note,
          at: new Date().toISOString(),
          policyId: policy.id,
          policyLabel: policy.label,
          writeback: stageWriteback(item, key, named ? `${note}${note ? " — " : ""}Owner: ${named}` : note),
          owner: named || undefined,
        };
        result = { ok: true, entry };
        return {
          ...s,
          ledger: [entry, ...s.ledger.filter((l) => !(l.caseId === caseId && l.processId === processId))],
        };
      });
      return result;
    },
    []
  );

  const publishWriteback = useCallback(async (entry: LoggedDisposition) => {
    if (!entry.writeback) return entry;
    const process = state.processes.find((p) => p.id === entry.processId);
    const custom = process ? state.customizations[process.id] : undefined;
    const enabled = custom?.writebackEnabled ?? true;
    if (!enabled) return entry;
    const url = custom?.writebackUrl?.trim() || "/api/writeback";
    const posted = await postWriteback(entry.writeback, url);
    const next: LoggedDisposition = { ...entry, writeback: posted };
    setState((s) => ({
      ...s,
      ledger: s.ledger.map((row) =>
        row.caseId === entry.caseId && row.processId === entry.processId && row.at === entry.at ? next : row
      ),
    }));
    return next;
  }, [state.customizations, state.processes]);

  const pullConnector = useCallback(async (processId: string) => {
    const process = state.processes.find((p) => p.id === processId);
    if (!process) return { ok: false, count: 0, error: "No process" };
    const template = TEMPLATE_MAP[process.templateId];
    const custom = state.customizations[processId] ?? emptyCustom(template);
    const adapterId =
      custom.connector?.adapterId ??
      ADAPTERS.find((a) => a.defaultTemplateId === process.templateId)?.id ??
      "";
    const url = custom.connector?.url || DEMO_FEEDS[adapterId];
    if (!url) return { ok: false, count: 0, error: "No connector URL" };
    try {
      const res = await fetch("/api/pull", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        const error = data.error ?? "Pull failed";
        customize(processId, {
          connector: { adapterId, url, lastError: error, lastPulledAt: new Date().toISOString() },
        });
        return { ok: false, count: 0, error };
      }
      const result = await pullToCases(adapterId, data.text);
      if (!result.ok) {
        const error = result.errors.join("; ") || "Ingest failed";
        customize(processId, {
          connector: { adapterId, url, lastError: error, lastPulledAt: new Date().toISOString() },
        });
        return { ok: false, count: 0, error };
      }
      ingestCases(processId, result.cases, "replace");
      customize(processId, {
        connector: { adapterId, url, lastPulledAt: new Date().toISOString(), lastError: undefined },
      });
      return { ok: true, count: result.cases.length };
    } catch (err) {
      return { ok: false, count: 0, error: err instanceof Error ? err.message : "Pull failed" };
    }
  }, [customize, ingestCases, state.customizations, state.processes]);

  const shareWorkspace = useCallback(async (name?: string) => {
    const res = await fetch("/api/workspace", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, snapshot: snapshotOf(state) }),
    });
    const data = (await res.json()) as WorkspaceMeta & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Could not share");
    const workspace = { id: data.id, key: data.key, name: data.name };
    setState((s) => ({ ...s, workspace }));
    return workspace;
  }, [state]);

  const joinWorkspace = useCallback(async (id: string, key: string) => {
    const res = await fetch(`/api/workspace/${id}?key=${encodeURIComponent(key)}`);
    const data = await res.json();
    if (!res.ok || !data.snapshot) return { ok: false, error: data.error ?? "Join failed" };
    setState({
      ...data.snapshot,
      workspace: { id, key, name: data.name ?? "Shared desk" },
    });
    return { ok: true };
  }, []);

  const leaveWorkspace = useCallback(() => {
    setState((s) => {
      const next = { ...s };
      delete next.workspace;
      return next;
    });
  }, []);

  const applySampleWeek = useCallback(() => {
    let result: { ok: boolean; count: number; error?: string } = {
      ok: false,
      count: 0,
      error: "No fraud process.",
    };
    setState((s) => {
      const fraud = s.processes.find((p) => p.templateId === "fraud");
      if (!fraud) return s;
      const existing = s.casesByProcess[fraud.id] ?? TEMPLATE_MAP.fraud.cases;
      const plan = sampleWeekPlan(fraud.id, existing);
      if (!plan) {
        result = { ok: false, count: 0, error: "Fraud queue has no mule typology to learn from." };
        return s;
      }
      const incoming = plan.extraCases.cases.map((item) => ({
        ...item,
        id: item.id.startsWith(`${fraud.id}:`) ? item.id : `${fraud.id}:${item.id}`,
        values: { ...item.values },
        scores: { ...item.scores },
        evidence: item.evidence.map((e) => ({ ...e })),
      }));
      const cases = [
        ...existing.filter((row) => !incoming.some((next) => next.id === row.id)),
        ...incoming,
      ];
      const template = TEMPLATE_MAP.fraud;
      const custom = s.customizations[fraud.id];
      let ledger = s.ledger;
      let applied = 0;
      for (const op of plan.dispositions) {
        const item = cases.find((c) => c.id === op.caseId);
        if (!item) continue;
        const ranked = rankCases(
          cases,
          template,
          custom,
          ledger.filter((l) => l.processId === fraud.id)
        );
        const row = ranked.find((r) => r.item.id === op.caseId);
        if (!row) continue;
        const gate = assertDisposition(op.key, row.policy, row.band, op.note);
        if (!gate.ok) continue;
        const park = assertPark(op.key, op.owner ?? "");
        if (!park.ok) continue;
        const named = (op.owner ?? "").trim();
        const entry: LoggedDisposition = {
          caseId: op.caseId,
          processId: fraud.id,
          key: op.key,
          note: op.note,
          at: new Date().toISOString(),
          policyId: row.policy.id,
          policyLabel: row.policy.label,
          writeback: stageWriteback(item, op.key, named ? `${op.note} — Owner: ${named}` : op.note),
          owner: named || undefined,
        };
        ledger = [entry, ...ledger.filter((l) => !(l.caseId === op.caseId && l.processId === fraud.id))];
        applied += 1;
      }
      result = { ok: applied > 0, count: applied };
      return {
        ...s,
        casesByProcess: { ...s.casesByProcess, [fraud.id]: cases },
        ledger,
      };
    });
    return result;
  }, []);

  const reopen = useCallback((caseId: string) => {
    setState((s) => ({ ...s, ledger: s.ledger.filter((l) => l.caseId !== caseId) }));
  }, []);

  const resetAll = useCallback(() => {
    const next = emptyStore();
    setState(next);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem("desk-os-v2");
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      ready,
      addProcess,
      removeProcess,
      customize,
      resetCustom,
      ingestCases,
      dispose,
      publishWriteback,
      pullConnector,
      shareWorkspace,
      joinWorkspace,
      leaveWorkspace,
      applySampleWeek,
      reopen,
      resetAll,
    }),
    [
      state,
      ready,
      addProcess,
      removeProcess,
      customize,
      resetCustom,
      ingestCases,
      dispose,
      publishWriteback,
      pullConnector,
      shareWorkspace,
      joinWorkspace,
      leaveWorkspace,
      applySampleWeek,
      reopen,
      resetAll,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDesk() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDesk must be inside DeskProvider");
  return ctx;
}

export function useProcess(processId: string) {
  const store = useDesk();
  const process = store.processes.find((p) => p.id === processId);
  const template = process ? TEMPLATE_MAP[process.templateId] : undefined;
  const custom = process ? store.customizations[process.id] : undefined;
  const cases: CaseItem[] =
    (process ? store.casesByProcess[process.id] : undefined) ?? template?.cases ?? [];
  const dispositions = store.ledger.filter((l) => l.processId === processId);

  const dispositionFor = (caseId: string) => dispositions.find((d) => d.caseId === caseId);

  const labels = (key: DispositionKey) =>
    custom?.dispositionLabels[key] ??
    template?.dispositions.find((d) => d.key === key)?.label ??
    key;

  const visibleFields = (template?.fields ?? []).filter(
    (f) => f.inQueue && !custom?.hiddenFields.includes(f.key)
  );

  const ranked = useMemo(() => {
    if (!template) return [];
    return rankCases(cases, template, custom, dispositions);
  }, [cases, template, custom, dispositions]);

  return {
    store,
    process,
    template,
    custom,
    cases,
    ranked,
    dispositions,
    dispositionFor,
    labels,
    visibleFields,
  };
}
