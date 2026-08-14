"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useDesk,
  TEMPLATES,
  TEMPLATE_MAP,
  adaptersFor,
  ingestToCases,
  formatScore,
} from "@/lib/desk";
import type { DeskId, PipelineResult } from "@/lib/desk";

export default function AddProcessForm() {
  const router = useRouter();
  const { addProcess, ingestCases } = useDesk();

  const [templateId, setTemplateId] = useState<DeskId>("banking");
  const template = TEMPLATE_MAP[templateId];

  const [name, setName] = useState("");

  const adapters = adaptersFor(templateId);
  const [adapterId, setAdapterId] = useState(adapters[0].id);
  const adapter = adapters.find((a) => a.id === adapterId) ?? adapters[0];

  const [pasted, setPasted] = useState("");
  const [preview, setPreview] = useState<PipelineResult | null>(null);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

  const pickTemplate = (id: DeskId) => {
    setTemplateId(id);
    const next = adaptersFor(id);
    setAdapterId(next[0].id);
    setPreview(null);
  };

  const runPreview = () => {
    setPreview(ingestToCases(pasted, adapter));
  };

  const submit = () => {
    const finalName = name.trim() || `${template.name} (new)`;
    const id = addProcess(templateId, finalName);
    if (preview?.ok && preview.cases.length > 0) {
      ingestCases(id, preview.cases, "replace");
    }
    setSubmittedId(id);
  };

  if (submittedId) {
    return (
      <div className="customize">
        <h2>Process added</h2>
        <p className="foot">
          {template.name} is live as its own queue. Ranking, columns, and action names
          start from the template defaults, ready to customize from the queue page.
        </p>
        <button className="btn primary" type="button" onClick={() => router.push(`/p/${submittedId}`)}>
          Open the queue
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="customize">
        <h2>1. Pick a template</h2>
        <p className="foot">
          A template is a ranking model and a working style, not a fixed app. One
          template can run as many named processes as the org needs.
        </p>
        <div className="grid-4">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`card${t.id === templateId ? " selected" : ""}`}
              onClick={() => pickTemplate(t.id)}
            >
              <span className="op">{t.operator}</span>
              <h3>{t.name}</h3>
              <p>{t.promise}</p>
              <span className="meta">
                <span>{t.adapter.system}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="customize">
        <h2>2. Name this instance</h2>
        <p className="foot">
          Give it a name a team will recognize on the home page, such as &quot;Wire ops
          - APAC&quot; or &quot;Q3 exam response.&quot;
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${template.name} (new)`}
        />
      </div>

      <div className="customize">
        <h2>3. Preview a source mapping (optional)</h2>
        <p className="foot">
          Paste a JSON array or a CSV export from the source system. Desk shows how the
          adapter maps it into cases before anything is wired live.
        </p>
        <div className="filter-seg">
          {adapters.map((a) => (
            <button
              key={a.id}
              type="button"
              className={a.id === adapterId ? "on" : ""}
              onClick={() => {
                setAdapterId(a.id);
                setPreview(null);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
        <p className="adapter">{adapter.plug}</p>
        <textarea
          className="note"
          placeholder={`Paste rows from ${adapter.system}...`}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
        />
        <button
          className="btn"
          type="button"
          onClick={runPreview}
          disabled={pasted.trim().length === 0}
        >
          Preview mapping
        </button>

        {preview && <PreviewResult result={preview} />}
      </div>

      <div className="customize">
        <h2>4. Add it</h2>
        <p className="foot">
          This preview never touches the queue. Adding the process seeds it from the
          template&apos;s own cases, the same way every template starts.
        </p>
        <button className="btn primary" type="button" onClick={submit}>
          Add process
        </button>
      </div>
    </div>
  );
}

function PreviewResult({ result }: { result: PipelineResult }) {
  if (!result.ok) {
    return (
      <div className="warn">
        <p>
          <b>Nothing mapped yet.</b>
        </p>
        <ul>
          {result.errors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="rec">
      <p>
        <b>{result.cases.length}</b> of <b>{result.records.length}</b> rows mapped into
        cases.
      </p>
      {result.errors.length > 0 && (
        <ul>
          {result.errors.map((message, i) => (
            <li key={i}>{message}</li>
          ))}
        </ul>
      )}
      <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
        {result.cases.slice(0, 3).map((c) => (
          <div key={c.id} className="mono">
            {c.title} - {c.subject} - {Object.entries(c.scores)
              .map(([key, value]) => `${key} ${formatScore(value)}`)
              .join(", ")}
          </div>
        ))}
      </div>
    </div>
  );
}
