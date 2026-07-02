import React, { useEffect, useState } from "react";

function cast(type, v) {
  if (type === "number") {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return v === "" ? null : v;
}

export function Field({ f, value, onChange }) {
  const label = <label className="fld">{f.label}</label>;

  if (f.type === "checkbox") {
    return (
      <label className="chk" style={{ paddingTop: 22 }}>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {f.label}
      </label>
    );
  }
  if (f.type === "select") {
    return (
      <div className={f.full ? "full" : ""}>
        {label}
        <select className="select" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{f.placeholder || "—"}</option>
          {(f.options || []).map((o) => {
            const val = typeof o === "string" ? o : o.value;
            const lbl = typeof o === "string" ? o : o.label;
            return <option key={val} value={val}>{lbl}</option>;
          })}
        </select>
      </div>
    );
  }
  if (f.type === "textarea") {
    return (
      <div className="full">
        {label}
        <textarea className="input" rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />
      </div>
    );
  }
  const inputType = f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "url" ? "url" : "text";
  return (
    <div className={f.full ? "full" : ""}>
      {label}
      <input
        className="input"
        type={inputType}
        placeholder={f.placeholder || ""}
        value={value ?? ""}
        onChange={(e) => onChange(cast(f.type, e.target.value))}
      />
    </div>
  );
}

export function RecordForm({ fields, record, onSave, saving, saveLabel = "Save", extraButtons }) {
  const [draft, setDraft] = useState(record || {});
  useEffect(() => { setDraft(record || {}); }, [record]);
  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div>
      <div className="form-grid">
        {fields.map((f) => (
          <Field key={f.key} f={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} />
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn blue" disabled={saving} onClick={() => onSave(draft)}>
          {saving ? "Saving…" : saveLabel}
        </button>
        {extraButtons}
      </div>
    </div>
  );
}
