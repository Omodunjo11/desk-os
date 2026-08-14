"use client";

import { useDesk, emptyCustom, rulesFor } from "@/lib/desk";
import type { DispositionKey, ProcessTemplate } from "@/lib/desk";

export default function CustomizePanel({
  processId,
  template,
}: {
  processId: string;
  template: ProcessTemplate;
}) {
  const { customizations, customize, resetCustom } = useDesk();
  const custom = customizations[processId] ?? emptyCustom(template);

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

  return (
    <div className="customize">
      <h2>Customize this process</h2>
      <p className="foot">
        Columns, ranking weights, and action names live per process. Nothing here
        touches the {template.name} template or any other process built from it.
      </p>

      <h3 style={{ fontSize: "0.82rem", margin: "14px 0 6px" }}>Queue columns</h3>
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

      <h3 style={{ fontSize: "0.82rem", margin: "14px 0 6px" }}>Ranking weights</h3>
      <p className="foot">{template.rankingLabel}</p>
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

      <h3 style={{ fontSize: "0.82rem", margin: "14px 0 6px" }}>Disposition labels</h3>
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

      <h3 style={{ fontSize: "0.82rem", margin: "14px 0 6px" }}>Policy lanes (not customizable)</h3>
      <p className="foot">
        Score never outranks these floors. Holds cannot auto-clear. That is the point of the
        overlay.
      </p>
      <ul className="evidence" style={{ marginBottom: 12 }}>
        {rulesFor(template).map((rule) => (
          <li key={rule.id}>
            <strong>
              Floor {rule.floor}
              {rule.hold ? " · hold" : ""}
              {rule.neverAutoDismiss ? " · never auto-dismiss" : ""}
            </strong>
            <span>{rule.label}</span>
          </li>
        ))}
      </ul>

      <button className="btn" type="button" onClick={() => resetCustom(processId)}>
        Reset to defaults
      </button>
    </div>
  );
}
