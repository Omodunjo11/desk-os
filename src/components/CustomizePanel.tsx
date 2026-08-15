"use client";

import { useState } from "react";
import {
  DEMO_FEEDS,
  emptyCustom,
  isLockedRule,
  rulesFor,
  useDesk,
} from "@/lib/desk";
import type { DispositionKey, PolicyRule, ProcessTemplate } from "@/lib/desk";

export default function CustomizePanel({
  processId,
  template,
}: {
  processId: string;
  template: ProcessTemplate;
}) {
  const { customizations, customize, resetCustom, pullConnector } = useDesk();
  const custom = customizations[processId] ?? emptyCustom(template);
  const rules = rulesFor(template, custom);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  const toggleField = (key: string) => {
    const hidden = custom.hiddenFields.includes(key)
      ? custom.hiddenFields.filter((k) => k !== key)
      : [...custom.hiddenFields, key];
    customize(processId, { hiddenFields: hidden });
  };

  const setWeight = (key: string, value: number) => {
    customize(processId, { weights: { ...custom.weights, [key]: value } });
  };

  const setLabel = (key: DispositionKey, value: string) => {
    customize(processId, { dispositionLabels: { ...custom.dispositionLabels, [key]: value } });
  };

  const setRules = (policyRules: PolicyRule[]) => {
    customize(processId, { policyRules });
  };

  const updateRule = (id: string, patch: Partial<PolicyRule>) => {
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  };

  const addLane = () => {
    // eslint-disable-next-line react-hooks/purity -- id only needs to be unique per click, not per render
    const id = `lane-${Date.now().toString(36)}`;
    setRules([
      ...rules,
      {
        id,
        label: "New lane",
        floor: Math.max(3, ...rules.map((r) => r.floor), 0),
        hold: false,
        neverAutoDismiss: false,
        match: { titleIncludes: ["keyword"] },
      },
    ]);
  };

  const removeLane = (id: string) => {
    if (isLockedRule(id, template)) return;
    setRules(rules.filter((rule) => rule.id !== id));
  };

  const pull = async () => {
    setPullMsg("Pulling…");
    const result = await pullConnector(processId);
    setPullMsg(
      result.ok ? `Replaced queue with ${result.count} live rows.` : result.error ?? "Pull failed"
    );
  };

  const adapterId = custom.connector?.adapterId ?? template.adapter.id;

  return (
    <div className="customize">
      <h2>Customize this process</h2>
      <p className="foot">
        Columns, weights, action names, and extra policy lanes live per process. System holds
        cannot be deleted or weakened.
      </p>

      <h3>Queue columns</h3>
      <div className="checks">
        {template.fields
          .filter((f) => f.inQueue)
          .map((f) => (
            <label key={f.key}>
              <input
                type="checkbox"
                checked={!custom.hiddenFields.includes(f.key)}
                onChange={() => toggleField(f.key)}
              />
              {f.label}
            </label>
          ))}
      </div>

      <h3>Ranking weights</h3>
      <p className="foot">{template.rankingLabel}. Weights never outrank a hold.</p>
      <div className="sliders">
        {template.rankingInputs.map((input) => {
          const value = custom.weights[input.key] ?? input.weight;
          return (
            <label key={input.key} title={input.hint}>
              <span>{input.label}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={value}
                onChange={(e) => setWeight(input.key, Number(e.target.value))}
              />
              <span>{value.toFixed(2)}</span>
            </label>
          );
        })}
      </div>

      <h3>Disposition labels</h3>
      <div className="rename">
        {template.dispositions.map((d) => (
          <div key={d.key} className="field">
            <span>{d.description}</span>
            <input
              value={custom.dispositionLabels[d.key] ?? d.label}
              onChange={(e) => setLabel(d.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <h3>Policy lanes</h3>
      <p className="foot">
        Floor 0 is looked at first. Locked holds keep their matcher even if you rename them.
      </p>
      <div className="policy-list">
        {rules.map((rule) => {
          const locked = isLockedRule(rule.id, template);
          return (
            <div key={rule.id} className="policy-row">
              <input
                type="number"
                min={0}
                max={50}
                disabled={locked}
                value={rule.floor}
                onChange={(e) => updateRule(rule.id, { floor: Number(e.target.value) })}
                aria-label="Floor"
              />
              <input
                value={rule.label}
                onChange={(e) => updateRule(rule.id, { label: e.target.value })}
              />
              <input
                disabled={locked}
                value={(rule.match.titleIncludes ?? []).join(", ")}
                onChange={(e) =>
                  updateRule(rule.id, {
                    match: {
                      ...rule.match,
                      titleIncludes: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                placeholder="title contains"
              />
              <span className="foot">
                {locked ? "Locked hold" : rule.hold ? "Hold" : "Lane"}
                {rule.neverAutoDismiss ? " · never auto-dismiss" : ""}
              </span>
              {!locked && (
                <button type="button" className="btn" onClick={() => removeLane(rule.id)}>
                  Remove
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button className="btn" type="button" onClick={addLane}>
        Add lane
      </button>

      <h3>Shift capacity</h3>
      <p className="foot">Analysts finish about 30–50 cases a shift. Overflow is named, not FIFOed.</p>
      <label className="field" style={{ maxWidth: 200 }}>
        <span>Cases / shift</span>
        <input
          type="number"
          min={5}
          max={80}
          value={custom.shiftCapacity ?? 40}
          onChange={(e) => customize(processId, { shiftCapacity: Number(e.target.value) })}
        />
      </label>

      <h3>Live connector</h3>
      <p className="foot">
        Pull JSON from a URL. Demo feeds are this app. External pulls must be https. Not a fake
        Actimize login.
      </p>
      <div className="studio-grid">
        <label className="field">
          <span>Feed URL</span>
          <input
            value={custom.connector?.url ?? DEMO_FEEDS[adapterId] ?? ""}
            onChange={(e) =>
              customize(processId, {
                connector: { adapterId, url: e.target.value, lastPulledAt: custom.connector?.lastPulledAt },
              })
            }
          />
        </label>
        <div>
          <button type="button" className="btn primary" onClick={() => void pull()}>
            Pull now
          </button>
          {pullMsg && <p className="foot">{pullMsg}</p>}
          {custom.connector?.lastPulledAt && (
            <p className="foot">Last pull {new Date(custom.connector.lastPulledAt).toLocaleString()}</p>
          )}
        </div>
      </div>

      <h3>Write-back</h3>
      <p className="foot">
        Posts a label only. Default sink is this app. Never a funds release.
      </p>
      <div className="checks">
        <label>
          <input
            type="checkbox"
            checked={custom.writebackEnabled ?? true}
            onChange={(e) => customize(processId, { writebackEnabled: e.target.checked })}
          />
          Post labels on disposition
        </label>
      </div>
      <label className="field">
        <span>Write-back URL</span>
        <input
          value={custom.writebackUrl ?? "/api/writeback"}
          onChange={(e) => customize(processId, { writebackUrl: e.target.value })}
        />
      </label>

      <button className="btn" type="button" onClick={() => resetCustom(processId)} style={{ marginTop: 12 }}>
        Reset to defaults
      </button>
    </div>
  );
}
