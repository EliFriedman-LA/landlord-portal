import React, { useEffect, useMemo, useState } from "react";
import {
  STAGES, listDeals, createDeal, updateDeal, removeDeal,
  listChecklist, updateStep, removeStep, addStep,
  listAnalyses, createAnalysis, removeAnalysis, computeAnalysis,
} from "./landlordDeals.js";
import { listProperties, contacts as contactsApi } from "./landlordProps.js";
import { RecordForm } from "./landlordForm.jsx";

const money = (n) => (n === null || n === undefined || isNaN(n) ? "—" : "$" + Math.round(n).toLocaleString());
const today = () => new Date().toISOString().slice(0, 10);
const stageLabel = (s) => (STAGES.find((x) => x.value === s) || {}).label || s;
const propName = (p) => (p ? p.label || p.full_address || "Property" : "");

/* ------------------------------ deal detail ------------------------------ */
function DealDetail({ deal, accountId, notify, properties, contacts, onBack, onChanged }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newStep, setNewStep] = useState("");

  async function loadSteps() {
    setLoading(true);
    try { setSteps(await listChecklist(deal.id)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadSteps(); /* eslint-disable-next-line */ }, [deal.id]);

  const fields = [
    { key: "label", label: "Deal name" },
    { key: "address", label: "Address", full: true },
    { key: "stage", label: "Stage", type: "select", options: STAGES },
    { key: "target_ready_date", label: "Target ready date", type: "date" },
    { key: "seller_contact_id", label: "Seller contact", type: "select", options: contacts.map((c) => ({ value: c.id, label: c.name })) },
    { key: "linked_property_id", label: "Linked property", type: "select", options: properties.map((p) => ({ value: p.id, label: propName(p) })) },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  async function saveDeal(draft) {
    setSaving(true);
    try { await updateDeal(deal.id, draft); notify("Saved"); onChanged(); }
    catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del() {
    if (!confirm("Delete this deal and its checklist?")) return;
    try { await removeDeal(deal.id); notify("Deal deleted"); onBack(); onChanged(); }
    catch (e) { notify(e.message || "Delete failed"); }
  }
  async function toggle(step, field) {
    try { await updateStep(step.id, { [field]: step[field] ? null : today() }); loadSteps(); }
    catch (e) { notify(e.message || "Update failed"); }
  }
  async function add() {
    if (!newStep.trim()) return;
    try { await addStep({ account_id: accountId, deal_id: deal.id, step_label: newStep.trim(), sort_order: steps.length }); setNewStep(""); loadSteps(); }
    catch (e) { notify(e.message || "Add failed"); }
  }

  const doneCount = steps.filter((s) => s.done_at).length;

  return (
    <div className="ll-content">
      <button className="back-link" onClick={onBack}>← Back to pipeline</button>
      <h2 style={{ color: "var(--nv)", margin: "0 0 4px" }}>{deal.label || deal.address || "Deal"}</h2>
      <div className="hint" style={{ marginBottom: 16 }}>{stageLabel(deal.stage)}</div>

      <div className="ll-card" style={{ marginBottom: 18 }}><div className="pad">
        <h3>Details</h3>
        <RecordForm fields={fields} record={deal} onSave={saveDeal} saving={saving}
          extraButtons={<button className="btn danger" onClick={del}>Delete deal</button>} />
      </div></div>

      <div className="ll-card"><div className="pad">
        <h3>Acquisition checklist <span className="hint" style={{ fontWeight: 400 }}>· {doneCount}/{steps.length} done</span></h3>
        {loading ? <div className="hint">Loading…</div> : (
          <div className="mini-list" style={{ marginTop: 10 }}>
            {steps.map((s) => (
              <div className="item" key={s.id}>
                <div>
                  <b style={{ textDecoration: s.done_at ? "line-through" : "none", opacity: s.done_at ? .6 : 1 }}>{s.step_label}</b>
                  {s.started_at && !s.done_at && <span className="badge pending" style={{ marginLeft: 8 }}>started</span>}
                  {s.done_at && <span className="hint"> · done {new Date(s.done_at + "T00:00:00").toLocaleDateString()}</span>}
                </div>
                <div style={{ whiteSpace: "nowrap", display: "flex", gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => toggle(s, "started_at")}>{s.started_at ? "Unstart" : "Start"}</button>
                  <button className={"btn sm " + (s.done_at ? "ghost" : "blue")} onClick={() => toggle(s, "done_at")}>{s.done_at ? "Undo" : "Done"}</button>
                  <button className="btn danger sm" onClick={() => removeStep(s.id).then(loadSteps)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 240px" }}>
            <label className="fld">Add a step</label>
            <input className="input" value={newStep} onChange={(e) => setNewStep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          </div>
          <button className="btn ghost" onClick={add}>Add step</button>
        </div>
      </div></div>
    </div>
  );
}

/* -------------------------------- pipeline ------------------------------- */
function Pipeline({ accountId, notify, properties, contacts }) {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setDeals(await listDeals(accountId)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId]);

  async function add(draft) {
    if (!draft.label?.trim() && !draft.address?.trim()) { notify("Give the deal a name or address"); return; }
    setSaving(true);
    try { const d = await createDeal(accountId, draft); setAdding(false); await refresh(); setOpenId(d.id); }
    catch (e) { notify(e.message || "Could not create deal"); }
    finally { setSaving(false); }
  }
  async function moveStage(deal, stage) {
    try { await updateDeal(deal.id, { stage }); refresh(); } catch (e) { notify(e.message || "Update failed"); }
  }

  const open = deals.find((d) => d.id === openId);
  if (open) {
    return <DealDetail deal={open} accountId={accountId} notify={notify} properties={properties} contacts={contacts}
      onBack={() => setOpenId(null)} onChanged={refresh} />;
  }

  const byStage = STAGES.map((s) => ({ ...s, deals: deals.filter((d) => d.stage === s.value) }));
  const addFields = [
    { key: "label", label: "Deal name" },
    { key: "address", label: "Address", full: true },
    { key: "seller_contact_id", label: "Seller contact", type: "select", options: contacts.map((c) => ({ value: c.id, label: c.name })) },
    { key: "target_ready_date", label: "Target ready date", type: "date" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {!adding && <button className="btn blue" onClick={() => setAdding(true)}>+ Add deal</button>}
      </div>
      {adding && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <h3>New deal</h3>
          <div className="hint" style={{ marginBottom: 8 }}>The acquisition checklist is created automatically.</div>
          <RecordForm fields={addFields} record={{}} onSave={add} saving={saving} saveLabel="Create deal"
            extraButtons={<button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>} />
        </div></div>
      )}

      {loading ? <div className="hint">Loading…</div> : deals.length === 0 && !adding ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">No deals yet</div>
          <div className="hint">Track properties you're chasing from lead to close, with a built-in acquisition checklist.</div>
        </div></div>
      ) : (
        byStage.filter((s) => s.deals.length > 0).map((s) => (
          <div key={s.value} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 8 }}>
              {s.label} · {s.deals.length}
            </div>
            <div className="mini-list">
              {s.deals.map((d) => (
                <div className="item" key={d.id}>
                  <div style={{ cursor: "pointer" }} onClick={() => setOpenId(d.id)}>
                    <b>{d.label || d.address || "Deal"}</b>
                    <span className="hint">{d.address && d.label ? " · " + d.address : ""}{d.target_ready_date ? " · target " + new Date(d.target_ready_date + "T00:00:00").toLocaleDateString() : ""}</span>
                  </div>
                  <select className="select" style={{ width: 160 }} value={d.stage} onChange={(e) => moveStage(d, e.target.value)}>
                    {STAGES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* -------------------------------- analyzer ------------------------------- */
const COMMON_TOP = [
  { key: "purchase_price", label: "Purchase price" },
  { key: "rehab_cost", label: "Rehab cost" },
  { key: "closing_cost", label: "Closing / acquisition costs" },
];
const PURCHASE_FIN = [
  { key: "down_payment_pct", label: "Down payment %" },
  { key: "purchase_loan_amount", label: "Loan amount ($, overrides %)" },
  { key: "rate", label: "Interest rate %" },
  { key: "amort_years", label: "Amortization (years)" },
];
const BRRRR_FIN = [
  { key: "arv", label: "After-repair value (ARV)" },
  { key: "refi_ltv", label: "Refi LTV %" },
  { key: "rate", label: "Interest rate %" },
  { key: "amort_years", label: "Amortization (years)" },
  { key: "loan_payoff", label: "Existing loan payoff" },
  { key: "refi_cost", label: "Refi closing costs" },
];
const COMMON_BOTTOM = [
  { key: "monthly_rent", label: "Monthly rent" },
  { key: "annual_taxes", label: "Annual property tax" },
  { key: "annual_insurance", label: "Annual insurance" },
  { key: "other_monthly", label: "Other monthly costs" },
  { key: "exit_sale_price", label: "Exit sale price" },
  { key: "exit_cost_pct", label: "Selling costs %" },
  { key: "reserve_months", label: "Reserve (months of PITI)" },
  { key: "owner_draw_monthly", label: "Owner draw / mo (profit first)" },
];
const FIELDS_FOR = (mode) => [...COMMON_TOP, ...(mode === "brrrr" ? BRRRR_FIN : PURCHASE_FIN), ...COMMON_BOTTOM];

function Analyzer({ accountId, notify, properties }) {
  const [inp, setInp] = useState({ financing_mode: "purchase", down_payment_pct: 20, refi_ltv: 75, rate: 7.25, amort_years: 30, exit_cost_pct: 8, reserve_months: 2, interest_only: false, splits: [] });
  const [saved, setSaved] = useState([]);
  const [label, setLabel] = useState("");
  const [prefillId, setPrefillId] = useState("");
  const out = useMemo(() => computeAnalysis(inp), [inp]);

  async function loadSaved() {
    try { setSaved(await listAnalyses(accountId)); } catch (e) { notify(e.message || "Load failed"); }
  }
  useEffect(() => { loadSaved(); /* eslint-disable-next-line */ }, [accountId]);

  const set = (k, v) => setInp((s) => ({ ...s, [k]: v }));

  function prefillFromProperty(id) {
    setPrefillId(id);
    const p = properties.find((x) => x.id === id);
    if (!p) return;
    setInp((s) => ({
      ...s,
      purchase_price: p.purchase_price != null ? String(p.purchase_price) : s.purchase_price,
    }));
    if (!label.trim()) setLabel(propName(p));
    notify("Pulled numbers from " + propName(p));
  }

  // partner splits editors
  const splits = Array.isArray(inp.splits) ? inp.splits : [];
  const setSplits = (arr) => set("splits", arr);
  const addSplit = () => setSplits([...splits, { name: "", pct: "" }]);
  const editSplit = (idx, key, val) => setSplits(splits.map((sp, i) => (i === idx ? { ...sp, [key]: val } : sp)));
  const removeSplit = (idx) => setSplits(splits.filter((_, i) => i !== idx));

  async function save() {
    if (!label.trim()) { notify("Name this analysis"); return; }
    try {
      await createAnalysis({ account_id: accountId, label: label.trim(), inputs: inp, results: out });
      setLabel(""); notify("Analysis saved"); loadSaved();
    } catch (e) { notify(e.message || "Save failed"); }
  }

  const dscrColor = out.dscr >= 1.25 ? "var(--ok)" : out.dscr >= 1 ? "var(--warn)" : "var(--danger)";
  const cfColor = out.monthlyCF >= 0 ? "var(--ok)" : "var(--danger)";
  const netCfColor = out.netMonthlyCF >= 0 ? "var(--ok)" : "var(--danger)";
  const capColor = out.capRate >= 6 ? "var(--ok)" : out.capRate >= 4 ? "var(--warn)" : "var(--danger)";
  const onePctColor = out.onePct >= 1 ? "var(--ok)" : out.onePct >= 0.8 ? "var(--warn)" : "var(--danger)";
  const V = { pass: { bg: "#e9f7ef", bd: "#bde5cd", fg: "var(--ok)", label: "Strong deal" },
              watch: { bg: "#fff6e8", bd: "#f0c98a", fg: "var(--warn)", label: "Proceed with care" },
              fail: { bg: "#fdecea", bd: "#e6c3bf", fg: "var(--danger)", label: "Does not pencil" },
              review: { bg: "#eef1f4", bd: "var(--line)", fg: "var(--muted)", label: "Add inputs" } }[out.verdict] || {};

  return (
    <div>
      <div className="ll-grid" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.9fr)", alignItems: "start" }}>
        <div className="ll-card"><div className="pad">
          <h3>Inputs</h3>
          {properties.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <label className="fld">Prefill from a property</label>
              <select className="select" value={prefillId} onChange={(e) => prefillFromProperty(e.target.value)}>
                <option value="">— start blank —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
              </select>
            </div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label className="fld">Financing</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[["purchase", "Financed purchase"], ["brrrr", "BRRRR / refinance"]].map(([k, l]) => (
                <button key={k} type="button" className={"btn sm " + ((inp.financing_mode || "purchase") === k ? "blue" : "ghost")} onClick={() => set("financing_mode", k)}>{l}</button>
              ))}
            </div>
            <div className="hint" style={{ marginTop: 4 }}>{(inp.financing_mode || "purchase") === "brrrr" ? "Loan comes from the refinance (ARV x refi LTV)." : "Enter a down payment % (or a loan amount) to get the purchase mortgage."}</div>
          </div>
          <label className="chk" style={{ margin: "6px 0 12px" }}>
            <input type="checkbox" checked={!!inp.interest_only} onChange={(e) => set("interest_only", e.target.checked)} /> Interest-only loan (DSCR)
          </label>
          <div className="form-grid">
            {FIELDS_FOR((inp.financing_mode === "brrrr") ? "brrrr" : "purchase").map((f) => (
              <div key={f.key}>
                <label className="fld">{f.label}</label>
                <input className="input" type="number" value={inp[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label className="fld" style={{ margin: 0 }}>Ownership split</label>
              <button className="btn ghost sm" onClick={addSplit}>+ Partner</button>
            </div>
            {splits.length === 0 ? (
              <div className="hint">Add partners to divide cash-in and cash flow by percentage.</div>
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
                <div className="hint" style={{ color: out.splitPctTotal === 100 ? "var(--ok)" : "var(--warn)" }}>
                  Total {out.splitPctTotal}% {out.splitPctTotal === 100 ? "✓" : "· should equal 100%"}
                </div>
              </>
            )}
          </div>
        </div></div>

        <div className="ll-card"><div className="pad">
          <h3>Results</h3>
          <div style={{ background: V.bg, border: "1px solid " + V.bd, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
            <b style={{ color: V.fg }}>{V.label}</b>
            <div className="hint" style={{ marginTop: 2 }}>{out.verdictNote}</div>
          </div>
          <Result label="All-in cost" value={money(out.allIn)} />
          <Result label="NOI (annual)" value={money(out.noi)} />
          <Result label="Cap rate" value={out.capRate ? out.capRate.toFixed(1) + "%" : "—"} color={capColor} />
          <Result label="1% rule (rent / price)" value={out.onePct ? out.onePct.toFixed(2) + "%" : "—"} color={onePctColor} />
          {out.mode === "brrrr"
            ? <Result label="Refinance loan" value={money(out.refiLoan)} />
            : <><Result label="Loan amount" value={money(out.loanAmount)} /><Result label="Down payment" value={money(out.downPayment)} /></>}
          <Result label="Monthly P&I" value={money(out.pi)} />
          <Result label="PITI" value={money(out.piti)} />
          <Result label="DSCR" value={out.dscr ? out.dscr.toFixed(2) : "—"} color={dscrColor} />
          <Result label="Monthly cash flow" value={money(out.monthlyCF)} color={cfColor} />
          {out.ownerDraw > 0 && <Result label="After owner draw / mo" value={money(out.netMonthlyCF)} color={netCfColor} />}
          <Result label="Annual cash flow" value={money(out.annualCF)} color={cfColor} />
          {out.mode === "brrrr" && <Result label="Cash out on refi" value={money(out.cashReturned)} />}
          <Result label={out.mode === "brrrr" ? "Cash left in deal" : "Cash invested"} value={out.cashLeftIn <= 0 ? "$0 (all out)" : money(out.cashLeftIn)} />
          {out.reserves > 0 && <Result label="Reserves set aside" value={money(out.reserves)} />}
          <Result label="Total cash needed" value={money(out.totalCashNeeded)} />
          <Result label="Cash-on-cash" value={out.coc === null ? "∞ (no cash left in)" : out.coc.toFixed(1) + "%"} />
          <Result label="Sale proceeds (exit)" value={money(out.saleProceeds)} />

          {out.splits.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="hint" style={{ fontWeight: 700, color: "var(--nv)", marginBottom: 4 }}>By partner</div>
              {out.splits.map((sp, idx) => (
                <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span className="hint">{sp.name} · {sp.pct}%</span>
                  <b style={{ color: "var(--nv)", fontSize: 13 }}>{money(sp.cash_in)} in · {money(sp.annual_cf)}/yr</b>
                </div>
              ))}
            </div>
          )}

          <div className="row" style={{ marginTop: 14, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label className="fld">Save as</label>
              <input className="input" placeholder="e.g. 12 Oak St BRRRR" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <button className="btn blue" onClick={save}>Save</button>
          </div>
        </div></div>
      </div>

      {saved.length > 0 && (
        <div className="ll-card" style={{ marginTop: 18 }}><div className="pad">
          <h3>Saved analyses</h3>
          <div className="mini-list" style={{ marginTop: 10 }}>
            {saved.map((a) => (
              <div className="item" key={a.id}>
                <div>
                  <b>{a.label}</b>
                  <span className="hint"> · DSCR {a.results?.dscr ? Number(a.results.dscr).toFixed(2) : "—"} · CF {money(a.results?.monthlyCF)}/mo · {new Date(a.created_at).toLocaleDateString()}</span>
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

function Result({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
      <span className="hint">{label}</span>
      <b style={{ color: color || "var(--nv)" }}>{value}</b>
    </div>
  );
}

/* --------------------------------- main ---------------------------------- */
export default function LandlordAcquisitions({ membership, notify }) {
  const accountId = membership.account_id;
  const [tab, setTab] = useState("Pipeline");
  const [properties, setProperties] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [ps, cs] = await Promise.all([listProperties(accountId), contactsApi.list({ account_id: accountId }, "name")]);
        setProperties(ps); setContacts(cs);
      } catch (e) { notify(e.message || "Load failed"); }
      finally { setReady(true); }
    })();
    /* eslint-disable-next-line */
  }, [accountId]);

  return (
    <div className="ll-content">
      {!ready ? <div className="hint">Loading…</div>
        : <Pipeline accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
    </div>
  );
}
