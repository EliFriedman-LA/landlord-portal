import React, { useEffect, useMemo, useState } from "react";
import { compareAllStrategies, listAnalyses, createAnalysis, removeAnalysis } from "./landlordDeals.js";
import { listProperties } from "./landlordProps.js";

const money = (v) => (v === null || v === undefined || isNaN(v) ? "—" : "$" + Math.round(v).toLocaleString());
const propName = (p) => (p ? p.label || p.full_address || "Property" : "");

const GROUPS = [
  { title: "Property & costs", fields: [
    { key: "purchase_price", label: "Purchase price" },
    { key: "rehab_cost", label: "Rehab cost" },
    { key: "closing_cost", label: "Closing / acquisition costs" },
    { key: "property_value", label: "Current value (refi basis)" },
    { key: "arv", label: "After-repair value (ARV)" },
  ] },
  { title: "Purchase financing", fields: [
    { key: "down_payment_pct", label: "Down payment %" },
    { key: "purchase_loan_amount", label: "Loan amount ($, overrides %)" },
    { key: "rate", label: "Interest rate %" },
    { key: "amort_years", label: "Amortization (years)" },
  ] },
  { title: "Refinance", fields: [
    { key: "refi_ltv", label: "Refi LTV %" },
    { key: "refi_new_loan", label: "New loan ($, overrides LTV)" },
    { key: "loan_payoff", label: "Existing loan payoff" },
    { key: "refi_cost", label: "Refi closing costs" },
  ] },
  { title: "Income & expenses", fields: [
    { key: "monthly_rent", label: "Monthly rent" },
    { key: "annual_taxes", label: "Annual property tax" },
    { key: "annual_insurance", label: "Annual insurance" },
    { key: "other_monthly", label: "Other monthly costs" },
  ] },
  { title: "Exit & reserves", fields: [
    { key: "exit_sale_price", label: "Exit sale price" },
    { key: "exit_cost_pct", label: "Selling costs %" },
    { key: "reserve_months", label: "Reserve (months of PITI)" },
    { key: "owner_draw_monthly", label: "Owner draw / mo" },
  ] },
];

const METRICS = [
  { key: "pi", label: "Monthly P&I", fmt: money },
  { key: "piti", label: "PITI", fmt: money },
  { key: "dscr", label: "DSCR", fmt: (v) => (v ? v.toFixed(2) : "—"), color: (v) => (v >= 1.25 ? "var(--ok)" : v >= 1 ? "var(--warn)" : "var(--danger)") },
  { key: "monthlyCF", label: "Monthly cash flow", fmt: money, color: (v) => (v >= 0 ? "var(--ok)" : "var(--danger)") },
  { key: "annualCF", label: "Annual cash flow", fmt: money, color: (v) => (v >= 0 ? "var(--ok)" : "var(--danger)") },
  { key: "cashLeftIn", label: "Cash needed / left in", fmt: money },
  { key: "cashReturned", label: "Cash out on refi", fmt: money },
  { key: "coc", label: "Cash-on-cash", fmt: (v) => (v == null ? "n/a" : v.toFixed(1) + "%"), color: (v) => (v == null ? "var(--nv)" : v >= 8 ? "var(--ok)" : v >= 0 ? "var(--warn)" : "var(--danger)") },
  { key: "saleProceeds", label: "Sale proceeds (exit)", fmt: money },
];

const VBADGE = {
  pass: { bg: "#e9f7ef", fg: "var(--ok)", t: "Strong" },
  watch: { bg: "#fff6e8", fg: "var(--warn)", t: "Thin" },
  fail: { bg: "#fdecea", fg: "var(--danger)", t: "No" },
  review: { bg: "#eef1f4", fg: "var(--muted)", t: "—" },
};

export default function LandlordDealAnalyzer({ membership, notify }) {
  const accountId = membership.account_id;
  const [inp, setInp] = useState({ down_payment_pct: 20, refi_ltv: 75, rate: 7.25, amort_years: 30, exit_cost_pct: 6, reserve_months: 2, interest_only: false, splits: [] });
  const [properties, setProperties] = useState([]);
  const [prefillId, setPrefillId] = useState("");
  const [saved, setSaved] = useState([]);
  const [label, setLabel] = useState("");

  const results = useMemo(() => compareAllStrategies(inp), [inp]);
  const bestKey = useMemo(() => {
    let b = -Infinity, k = null;
    results.forEach((r) => { if (r.out.monthlyCF > b) { b = r.out.monthlyCF; k = r.key; } });
    return k;
  }, [results]);
  const best = results.find((r) => r.key === bestKey);

  const loadSaved = async () => { try { setSaved(await listAnalyses(accountId)); } catch (e) { /* ignore */ } };
  useEffect(() => {
    (async () => { try { setProperties(await listProperties(accountId)); } catch (e) { /* ignore */ } loadSaved(); })();
    /* eslint-disable-next-line */
  }, [accountId]);

  const set = (k, v) => setInp((s) => ({ ...s, [k]: v }));

  function prefill(id) {
    setPrefillId(id);
    const p = properties.find((x) => x.id === id);
    if (!p) return;
    setInp((s) => ({ ...s, purchase_price: p.purchase_price != null ? String(p.purchase_price) : s.purchase_price }));
    if (!label.trim()) setLabel(propName(p));
    notify("Pulled numbers from " + propName(p));
  }

  const splits = Array.isArray(inp.splits) ? inp.splits : [];
  const setSplits = (arr) => set("splits", arr);
  const addSplit = () => setSplits([...splits, { name: "", pct: "" }]);
  const editSplit = (idx, key, val) => setSplits(splits.map((sp, i) => (i === idx ? { ...sp, [key]: val } : sp)));
  const removeSplit = (idx) => setSplits(splits.filter((_, i) => i !== idx));
  const splitTotal = splits.reduce((a, sp) => a + (Number(sp.pct) || 0), 0);

  async function save() {
    if (!label.trim()) { notify("Name this analysis"); return; }
    try {
      await createAnalysis({ account_id: accountId, label: label.trim(), inputs: inp, results: results.map((r) => ({ mode: r.key, monthlyCF: r.out.monthlyCF, coc: r.out.coc, dscr: r.out.dscr })) });
      setLabel(""); notify("Analysis saved"); loadSaved();
    } catch (e) { notify(e.message || "Save failed"); }
  }

  const thBase = { padding: "8px 10px", fontSize: 12, textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div className="ll-content">
      <div className="ll-card"><div className="pad">
        <h3>Deal inputs</h3>
        <div className="hint" style={{ marginBottom: 12 }}>Enter the numbers once — every strategy below is scored from the same inputs.</div>
        {properties.length > 0 && (
          <div style={{ marginBottom: 14, maxWidth: 340 }}>
            <label className="fld">Prefill from a property</label>
            <select className="select" value={prefillId} onChange={(e) => prefill(e.target.value)}>
              <option value="">— start blank —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
            </select>
          </div>
        )}
        <label className="chk" style={{ margin: "0 0 14px" }}>
          <input type="checkbox" checked={!!inp.interest_only} onChange={(e) => set("interest_only", e.target.checked)} /> Interest-only loan (DSCR)
        </label>
        {GROUPS.map((g) => (
          <div key={g.title} style={{ marginBottom: 14 }}>
            <div className="hint" style={{ fontWeight: 700, color: "var(--nv)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".04em", fontSize: 11 }}>{g.title}</div>
            <div className="form-grid">
              {g.fields.map((f) => (
                <div key={f.key}>
                  <label className="fld">{f.label}</label>
                  <input className="input" type="number" value={inp[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div className="hint" style={{ fontWeight: 700, color: "var(--nv)", textTransform: "uppercase", letterSpacing: ".04em", fontSize: 11, margin: 0 }}>Ownership split</div>
            <button className="btn ghost sm" onClick={addSplit}>+ Partner</button>
          </div>
          {splits.length === 0 ? (
            <div className="hint">Optional — divides cash-in and cash flow by percentage.</div>
          ) : (
            <>
              {splits.map((sp, idx) => (
                <div className="row" key={idx} style={{ alignItems: "flex-end", marginBottom: 8 }}>
                  <div style={{ flex: "1 1 160px" }}>
                    <input className="input" placeholder="Partner name" value={sp.name || ""} onChange={(e) => editSplit(idx, "name", e.target.value)} />
                  </div>
                  <div style={{ width: 96 }}>
                    <input className="input" type="number" placeholder="%" value={sp.pct ?? ""} onChange={(e) => editSplit(idx, "pct", e.target.value)} />
                  </div>
                  <button className="btn danger sm" onClick={() => removeSplit(idx)}>✕</button>
                </div>
              ))}
              <div className="hint" style={{ color: splitTotal === 100 ? "var(--ok)" : "var(--warn)" }}>Total {splitTotal}% {splitTotal === 100 ? "✓" : "· should equal 100%"}</div>
            </>
          )}
        </div>
      </div></div>

      <div className="ll-card" style={{ marginTop: 16 }}><div className="pad">
        <h3>Which strategy pays?</h3>
        {best && (
          <div className="note" style={{ marginBottom: 12 }}>
            Best monthly cash flow: <b>{best.label}</b> at <b>{money(best.out.monthlyCF)}/mo</b>
            {best.out.coc != null ? <> · {best.out.coc.toFixed(1)}% cash-on-cash</> : null}.
          </div>
        )}
        <div style={{ overflowX: "auto" }}>
          <table className="ll-table" style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Metric</th>
                {results.map((r) => (
                  <th key={r.key} style={{ ...thBase, background: r.key === bestKey ? "var(--bl-soft)" : "transparent", color: "var(--nv)" }}>{r.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ color: "var(--muted)" }}>Verdict</td>
                {results.map((r) => {
                  const v = VBADGE[r.out.verdict] || VBADGE.review;
                  return <td key={r.key} style={{ textAlign: "right", background: r.key === bestKey ? "var(--bl-soft)" : "transparent" }}><span className="badge" style={{ background: v.bg, color: v.fg }}>{v.t}</span></td>;
                })}
              </tr>
              {METRICS.map((m) => (
                <tr key={m.key}>
                  <td style={{ color: "var(--muted)" }}>{m.label}</td>
                  {results.map((r) => {
                    const val = r.out[m.key];
                    const col = m.color ? m.color(val) : "var(--nv)";
                    return <td key={r.key} style={{ textAlign: "right", fontWeight: 600, color: col, background: r.key === bestKey ? "var(--bl-soft)" : "transparent" }}>{m.fmt(val)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {splits.length > 0 && best && (
          <div style={{ marginTop: 12 }}>
            <div className="hint" style={{ fontWeight: 700, color: "var(--nv)", marginBottom: 4 }}>Partner split — {best.label} (cash needed {money(best.out.cashLeftIn)})</div>
            {best.out.splits.map((sp, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="hint">{sp.name} · {sp.pct}%</span>
                <b style={{ color: "var(--nv)", fontSize: 13 }}>{money(sp.cash_in)} in · {money(sp.annual_cf)}/yr</b>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
          <div style={{ flex: 1, maxWidth: 360 }}>
            <label className="fld">Save this analysis as</label>
            <input className="input" placeholder="e.g. 908 Cherry St" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <button className="btn blue" onClick={save}>Save</button>
        </div>
      </div></div>

      {saved.length > 0 && (
        <div className="ll-card" style={{ marginTop: 16 }}><div className="pad">
          <h3>Saved analyses</h3>
          <div className="mini-list" style={{ marginTop: 10 }}>
            {saved.map((a) => (
              <div className="item" key={a.id}>
                <div>
                  <b>{a.label}</b>
                  <span className="hint"> · {new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" onClick={() => setInp({ splits: [], ...(a.inputs || {}) })}>Load</button>{" "}
                  <button className="btn danger sm" onClick={() => removeAnalysis(a.id).then(loadSaved)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div></div>
      )}
    </div>
  );
}
