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
const A_FIELDS = [
  { key: "purchase_price", label: "Purchase price" },
  { key: "rehab_cost", label: "Rehab cost" },
  { key: "closing_cost", label: "Closing / acquisition costs" },
  { key: "arv", label: "After-repair value (ARV)" },
  { key: "refi_ltv", label: "Refi LTV %" },
  { key: "rate", label: "Interest rate %" },
  { key: "amort_years", label: "Amortization (years)" },
  { key: "loan_payoff", label: "Existing loan payoff" },
  { key: "refi_cost", label: "Refi closing costs" },
  { key: "monthly_rent", label: "Monthly rent" },
  { key: "annual_taxes", label: "Annual property tax" },
  { key: "annual_insurance", label: "Annual insurance" },
  { key: "other_monthly", label: "Other monthly costs" },
  { key: "exit_sale_price", label: "Exit sale price" },
  { key: "exit_cost_pct", label: "Selling costs %" },
];

function Analyzer({ accountId, notify, properties }) {
  const [inp, setInp] = useState({ refi_ltv: 75, rate: 7.25, amort_years: 30, exit_cost_pct: 8, interest_only: false });
  const [saved, setSaved] = useState([]);
  const [label, setLabel] = useState("");
  const out = useMemo(() => computeAnalysis(inp), [inp]);

  async function loadSaved() {
    try { setSaved(await listAnalyses(accountId)); } catch (e) { notify(e.message || "Load failed"); }
  }
  useEffect(() => { loadSaved(); /* eslint-disable-next-line */ }, [accountId]);

  const set = (k, v) => setInp((s) => ({ ...s, [k]: v }));

  async function save() {
    if (!label.trim()) { notify("Name this analysis"); return; }
    try {
      await createAnalysis({ account_id: accountId, label: label.trim(), inputs: inp, results: out });
      setLabel(""); notify("Analysis saved"); loadSaved();
    } catch (e) { notify(e.message || "Save failed"); }
  }

  const dscrColor = out.dscr >= 1.25 ? "var(--ok)" : out.dscr >= 1 ? "var(--warn)" : "var(--danger)";
  const cfColor = out.monthlyCF >= 0 ? "var(--ok)" : "var(--danger)";

  return (
    <div>
      <div className="ll-grid" style={{ gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.9fr)", alignItems: "start" }}>
        <div className="ll-card"><div className="pad">
          <h3>Inputs</h3>
          <label className="chk" style={{ margin: "6px 0 12px" }}>
            <input type="checkbox" checked={!!inp.interest_only} onChange={(e) => set("interest_only", e.target.checked)} /> Interest-only loan (DSCR)
          </label>
          <div className="form-grid">
            {A_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="fld">{f.label}</label>
                <input className="input" type="number" value={inp[f.key] ?? ""} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
          </div>
        </div></div>

        <div className="ll-card"><div className="pad">
          <h3>Results</h3>
          <Result label="All-in cost" value={money(out.allIn)} />
          <Result label="Refinance loan" value={money(out.refiLoan)} />
          <Result label="Monthly P&I" value={money(out.pi)} />
          <Result label="PITI" value={money(out.piti)} />
          <Result label="DSCR" value={out.dscr ? out.dscr.toFixed(2) : "—"} color={dscrColor} />
          <Result label="Monthly cash flow" value={money(out.monthlyCF)} color={cfColor} />
          <Result label="Annual cash flow" value={money(out.annualCF)} color={cfColor} />
          <Result label="Cash out on refi" value={money(out.cashReturned)} />
          <Result label="Cash left in deal" value={out.cashLeftIn <= 0 ? "$0 (all out)" : money(out.cashLeftIn)} />
          <Result label="Cash-on-cash" value={out.coc === null ? "∞ (no cash left in)" : out.coc.toFixed(1) + "%"} />
          <Result label="Sale proceeds (exit)" value={money(out.saleProceeds)} />

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
                  <button className="btn ghost sm" onClick={() => setInp(a.inputs || {})}>Load</button>{" "}
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
      <div className="tabs">
        {["Pipeline", "Deal analyzer"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {!ready ? <div className="hint">Loading…</div> : tab === "Pipeline"
        ? <Pipeline accountId={accountId} notify={notify} properties={properties} contacts={contacts} />
        : <Analyzer accountId={accountId} notify={notify} properties={properties} />}
    </div>
  );
}
