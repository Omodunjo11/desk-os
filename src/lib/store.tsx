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
import { backfillIntake } from "./actions";
import { rankCases } from "./ranking";
import { TEMPLATES, TEMPLATE_MAP } from "./templates";
import type {
  CaseItem,
  DeskId,
  DispositionKey,
  LoggedDisposition,
  ProcessCustomization,
  ProcessInstance,
  ProcessTemplate,
} from "./types";

const STORAGE_KEY = "desk-os-v1";

type StoreShape = {
  processes: ProcessInstance[];
  customizations: Record<string, ProcessCustomization>;
  ledger: LoggedDisposition[];
  casesByProcess: Record<string, CaseItem[]>;
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
  return {
    hiddenFields: [],
    weights: Object.fromEntries(template.rankingInputs.map((i) => [i.key, i.weight])),
    dispositionLabels: Object.fromEntries(
      template.dispositions.map((d) => [d.key, d.label])
    ) as ProcessCustomization["dispositionLabels"],
  };
}

function seedCases(): Record<string, CaseItem[]> {
  return Object.fromEntries(
    TEMPLATES.map((t) => [t.id, t.cases.map((c) => backfillIntake({ ...c }))])
  );
}

function cloneCases(processId: string, templateId: DeskId): CaseItem[] {
  return TEMPLATE_MAP[templateId].cases.map((item) =>
    backfillIntake({
      ...item,
      id: `${processId}:${item.id}`,
      values: { ...item.values },
      scores: { ...item.scores },
      evidence: item.evidence.map((e) => ({ ...e })),
    })
  );
}

function emptyStore(): StoreShape {
  return {
    processes: defaultProcesses(),
    customizations: {},
    ledger: [],
    casesByProcess: seedCases(),
  };
}

function load(): StoreShape {
  const fallback = emptyStore();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    if (!parsed.processes?.length) return fallback;
    return {
      processes: parsed.processes,
      customizations: parsed.customizations ?? {},
      ledger: parsed.ledger ?? [],
      casesByProcess: { ...fallback.casesByProcess, ...(parsed.casesByProcess ?? {}) },
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
  dispose: (
    processId: string,
    caseId: string,
    key: DispositionKey,
    note?: string,
    source?: "manual" | "agent"
  ) => void;
  reopen: (caseId: string) => void;
  resetAll: () => void;
  setDraft: (processId: string, caseId: string, draft: CaseItem["draftedAction"]) => void;
  clearDraft: (processId: string, caseId: string) => void;
};

const Ctx = createContext<DeskStore | null>(null);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreShape>(emptyStore);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(load());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
          [processId]: {
            hiddenFields: patch.hiddenFields ?? current.hiddenFields,
            weights: patch.weights ?? current.weights,
            dispositionLabels: patch.dispositionLabels ?? current.dispositionLabels,
          },
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
    (
      processId: string,
      caseId: string,
      key: DispositionKey,
      note = "",
      source: "manual" | "agent" = "manual"
    ) => {
      setState((s) => ({
        ...s,
        ledger: [
          { caseId, processId, key, note, source, at: new Date().toISOString() },
          ...s.ledger.filter((l) => !(l.caseId === caseId && l.processId === processId)),
        ],
      }));
    },
    []
  );

  const setDraft = useCallback(
    (processId: string, caseId: string, draft: CaseItem["draftedAction"]) => {
      setState((s) => {
        const existing = s.casesByProcess[processId] ?? [];
        return {
          ...s,
          casesByProcess: {
            ...s.casesByProcess,
            [processId]: existing.map((c) => (c.id === caseId ? { ...c, draftedAction: draft } : c)),
          },
        };
      });
    },
    []
  );

  const clearDraft = useCallback(
    (processId: string, caseId: string) => setDraft(processId, caseId, undefined),
    [setDraft]
  );

  const reopen = useCallback((caseId: string) => {
    setState((s) => ({ ...s, ledger: s.ledger.filter((l) => l.caseId !== caseId) }));
  }, []);

  const resetAll = useCallback(() => {
    const next = emptyStore();
    setState(next);
    window.localStorage.removeItem(STORAGE_KEY);
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
      reopen,
      resetAll,
      setDraft,
      clearDraft,
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
      reopen,
      resetAll,
      setDraft,
      clearDraft,
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
    return rankCases(cases, template, custom);
  }, [cases, template, custom]);

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
