import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  listIncome, listExpenses, listBills,
  income, expenses, bills, billAllocations, PAY_METHODS, money,
  recurring, listSchedules, ensureOccurrences, listOutstanding,
  confirmOccurrence, skipOccurrence, RECUR_INTERVALS, RECUR_KINDS, intervalLabel,
  extractBill, billLines, saveBillLines, recallLineProperties,
} from "./landlordMoney.js";
import { listProperties, contacts as contactsApi } from "./landlordProps.js";
import { RecordForm } from "./landlordForm.jsx";
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "");
const propName = (p) => (p ? p.label || p.full_address || "Property" : "—");
const todayStr = () => new Date().toISOString().slice(0, 10);
// MM/DD/YYYY (or similar) -> YYYY-MM-DD for <input type=date>; else "".
function toIsoDate(v) {
  if (!v) return "";
  const m = String(v).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, mo, da, yr] = m;
    if (yr.length === 2) yr = "20" + yr;
    return `${yr}-${mo.padStart(2, "0")}-${da.padStart(2, "0")}`;
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
/* -------------------------- income / expense ledger -------------------------- */
function Ledger({ kind, api, load, accountId, notify, properties, contacts }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null); // id | "new" | null
  const [saving, setSaving] = useState(false);
  async function refresh() {
    setLoading(true);
    try { setRows(await load(accountId, filter || undefined)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId, filter]);
  const fields = useMemo(() => {
    const propOpts = properties.map((p) => ({ value: p.id, label: propName(p) }));
    if (kind === "income") {
      return [
        { key: "property_id", label: "Property", type: "select", options: propOpts },
        { key: "entry_date", label: "Date", type: "date" },
        { key: "category", label: "Category", placeholder: "rent" },
        { key: "amount", label: "Amount", type: "number" },
        { key: "source", label: "Source" },
        { key: "method", label: "Method", type: "select", options: PAY_METHODS },
        { key: "reference", label: "Reference" },
        { key: "notes", label: "Notes", type: "textarea" },
      ];
    }
    return [
      { key: "property_id", label: "Property (optional)", type: "select", options: propOpts },
      { key: "entry_date", label: "Date", type: "date" },
      { key: "category", label: "Category" },
      { key: "amount", label: "Amount", type: "number" },
      { key: "vendor_contact_id", label: "Vendor", type: "select", options: contacts.map((c) => ({ value: c.id, label: c.name })) },
      { key: "method", label: "Method", type: "select", options: PAY_METHODS },
      { key: "reference", label: "Reference" },
      { key: "notes", label: "Notes", type: "textarea" },
    ];
  }, [kind, properties, contacts]);
  async function save(draft) {
    if (draft.amount === null || draft.amount === undefined || draft.amount === "") { notify("Enter an amount"); return; }
    if (kind === "income" && !draft.property_id) { notify("Pick a property"); return; }
    setSaving(true);
    try {
      if (editing === "new") await api.create({ account_id: accountId, ...draft });
      else await api.update(editing, draft);
      setEditing(null); notify("Saved"); refresh();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del(id) {
    if (!confirm("Delete this entry?")) return;
    try { await api.remove(id); notify("Deleted"); refresh(); } catch (e) { notify(e.message || "Delete failed"); }
  }
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const editRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) : null;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ minWidth: 220 }}>
          <label className="fld">Filter by property</label>
          <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All properties</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
          </select>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="hint">{kind === "income" ? "Total income" : "Total expenses"}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: kind === "income" ? "var(--ok)" : "var(--nv)" }}>{money(total)}</div>
        </div>
      </div>
      {loading ? <div className="hint">Loading…</div> : rows.length === 0 && editing !== "new" ? (
        <div className="hint" style={{ marginBottom: 12 }}>No entries yet.</div>
      ) : (
        <div className="mini-list" style={{ marginBottom: 14 }}>
          {rows.map((r) => (
            <div className="item" key={r.id}>
              <div>
                <b>{money(r.amount)}</b>
                <span className="hint"> · {fmtDate(r.entry_date)} · {propName(r.property)}
                  {r.category ? " · " + r.category : ""}
                  {kind === "expense" && r.vendor?.name ? " · " + r.vendor.name : ""}
                  {kind === "income" && r.source ? " · " + r.source : ""}</span>
              </div>
              <div style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => setEditing(r.id)}>Edit</button>{" "}
                <button className="btn danger sm" onClick={() => del(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <div className="ll-card"><div className="pad">
          <RecordForm fields={fields} record={editRow || { entry_date: new Date().toISOString().slice(0, 10), category: kind === "income" ? "rent" : null }}
            onSave={save} saving={saving}
            extraButtons={<button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>} />
        </div></div>
      ) : (
        <button className="btn ghost" onClick={() => setEditing("new")}>+ Add {kind === "income" ? "income" : "expense"}</button>
      )}
    </div>
  );
}
/* ------------------------------ charge line ------------------------------- */
// One line the vendor billed. Assign it to a property in a click, split it
// across several, or mark it as not yours — the bill total never changes, so
// your records still match the invoice.
function ChargeLine({ line, billId, accountId, properties, notify, refresh, suggested }) {
  const [prop, setProp] = useState("");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const allocs = line.allocations || [];
  const assigned = allocs.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const left = Math.round(((Number(line.amount) || 0) - assigned) * 100) / 100;
  const settled = Math.abs(left) < 0.005;

  // Pre-select where this charge went last time; the person still confirms.
  useEffect(() => { if (!prop && suggested) setProp(suggested); /* eslint-disable-next-line */ }, [suggested]);

  async function assign() {
    const value = amt === "" ? left : Number(amt);
    if (!prop) { notify("Pick a property for this charge"); return; }
    if (!value) { notify("Nothing left to assign on this charge"); return; }
    setBusy(true);
    try {
      await billAllocations.create({
        account_id: accountId, bill_id: billId, line_id: line.id,
        property_id: prop, amount: value,
      });
      setAmt(""); refresh();
    } catch (e) { notify(e.message || "Could not assign that charge"); }
    finally { setBusy(false); }
  }
  async function unassign(id) {
    try { await billAllocations.remove(id); refresh(); }
    catch (e) { notify(e.message || "Could not undo that"); }
  }
  async function toggleExcluded() {
    try { await billLines.update(line.id, { excluded: !line.excluded }); refresh(); }
    catch (e) { notify(e.message || "Could not update that charge"); }
  }
  async function removeLine() {
    if (!confirm("Delete this charge line? Use “Not mine” instead if it was on the bill but isn't yours.")) return;
    try { await billLines.remove(line.id); refresh(); }
    catch (e) { notify(e.message || "Could not delete that charge"); }
  }

  return (
    <div className="item" style={{ display: "block", opacity: line.excluded ? 0.55 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ textDecoration: line.excluded ? "line-through" : "none" }}>
          {line.description || "Charge"}
        </span>
        <b>{money(line.amount)}</b>
      </div>

      {allocs.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {allocs.map((a) => (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span className="hint">→ {propName(a.property)} · <b>{money(a.amount)}</b></span>
              <button className="btn ghost sm" onClick={() => unassign(a.id)}>Undo</button>
            </div>
          ))}
        </div>
      )}

      {!line.excluded && !settled && (
        <div className="row" style={{ alignItems: "flex-end", marginTop: 8 }}>
          <div style={{ flex: "1 1 180px" }}>
            <select className="select" value={prop} onChange={(e) => setProp(e.target.value)}>
              <option value="">— choose property —</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
            </select>
          </div>
          <div style={{ width: 110 }}>
            <input className="input" type="number" placeholder={money(left)} value={amt}
              onChange={(e) => setAmt(e.target.value)} />
          </div>
          <button className="btn blue sm" onClick={assign} disabled={busy}>
            {allocs.length ? "Split" : "Assign"}
          </button>
        </div>
      )}

      <div className="hint" style={{ marginTop: 6, display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span>
          {line.excluded ? "Not yours — left out of the split"
            : settled ? "Fully assigned"
            : money(left) + " still to assign"}
        </span>
        <span style={{ display: "flex", gap: 8 }}>
          <button className="btn ghost sm" onClick={toggleExcluded}>
            {line.excluded ? "It is mine" : "Not mine"}
          </button>
          <button className="btn ghost sm" onClick={removeLine}>Delete</button>
        </span>
      </div>
    </div>
  );
}

/* -------------------------------- bill row -------------------------------- */
function BillRow({ bill, accountId, notify, properties, contacts, refresh }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editBill, setEditBill] = useState(false);
  const [allocProp, setAllocProp] = useState("");
  const [allocAmt, setAllocAmt] = useState("");
  const [suggested, setSuggested] = useState({});
  // Every allocation counts toward the bill total, whether it came from a charge
  // line or was entered by hand. The manual list below shows only the hand-typed
  // ones so a line-level split isn't listed twice.
  const allocated = (bill.allocations || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const remaining = (Number(bill.total_amount) || 0) - allocated;
  const lines = bill.lines || [];
  const manualAllocs = (bill.allocations || []).filter((a) => !a.line_id);
  const lineKey = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

  // Look up where these charges went last time, once the bill is expanded.
  useEffect(() => {
    if (!open || !lines.length) return;
    const need = lines
      .filter((l) => !l.excluded && !(l.allocations || []).length)
      .map((l) => l.description);
    if (!need.length) return;
    let alive = true;
    recallLineProperties(accountId, need)
      .then((m) => { if (alive) setSuggested(m); })
      .catch(() => {});
    return () => { alive = false; };
    /* eslint-disable-next-line */
  }, [open, accountId, lines.length]);
  const billFields = [
    { key: "vendor_contact_id", label: "Vendor", type: "select", options: contacts.map((c) => ({ value: c.id, label: c.name })) },
    { key: "bill_date", label: "Bill date", type: "date" },
    { key: "due_date", label: "Due date", type: "date" },
    { key: "total_amount", label: "Total amount", type: "number" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" } ] },
    { key: "category", label: "Category" },
    { key: "recurring", label: "Recurring", type: "checkbox" },
    { key: "recurrence", label: "Recurrence", type: "select", options: [
      { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" } ] },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
  async function saveBill(draft) {
    setSaving(true);
    try { await bills.update(bill.id, draft); setEditBill(false); notify("Bill saved"); refresh(); }
    catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function delBill() {
    if (!confirm("Delete this bill and its allocations?")) return;
    try { await bills.remove(bill.id); notify("Bill deleted"); refresh(); } catch (e) { notify(e.message || "Delete failed"); }
  }
  async function addAlloc() {
    if (!allocProp || allocAmt === "") { notify("Pick a property and amount"); return; }
    try {
      await billAllocations.create({ account_id: accountId, bill_id: bill.id, property_id: allocProp, amount: Number(allocAmt) });
      setAllocProp(""); setAllocAmt(""); notify("Allocated"); refresh();
    } catch (e) { notify(e.message || "Allocation failed"); }
  }
  async function delAlloc(id) {
    try { await billAllocations.remove(id); refresh(); } catch (e) { notify(e.message || "Failed"); }
  }
  return (
    <div className="ll-card" style={{ marginBottom: 10 }}>
      <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}>
        <div>
          <b>{bill.vendor?.name || "Bill"} · {money(bill.total_amount)}</b>
          <span className="hint"> · {bill.status}{bill.due_date ? " · due " + fmtDate(bill.due_date) : ""}{bill.recurring ? " · recurring" : ""}</span>
          <div className="hint">
            Allocated {money(allocated)} of {money(bill.total_amount)}
            {remaining !== 0 && <span style={{ color: remaining > 0 ? "var(--warn)" : "var(--danger)" }}> · {remaining > 0 ? money(remaining) + " unallocated" : money(-remaining) + " over"}</span>}
          </div>
        </div>
        <span className="hint">{open ? "▲" : "▼"}</span>
      </div>
      {open && (
        <div className="pad" style={{ borderTop: "1px solid var(--line)" }}>
          {lines.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, color: "var(--nv)", marginBottom: 8 }}>Charges on this bill</div>
              <div className="mini-list">
                {lines.map((l) => (
                  <ChargeLine key={l.id} line={l} billId={bill.id} accountId={accountId}
                    properties={properties} notify={notify} refresh={refresh}
                    suggested={suggested[lineKey(l.description)]} />
                ))}
              </div>
            </div>
          )}

          <div style={{ fontWeight: 600, color: "var(--nv)", marginBottom: 8 }}>
            {lines.length > 0 ? "Other amounts" : "Split across properties"}
          </div>
          {manualAllocs.length > 0 && (
            <div className="mini-list" style={{ marginBottom: 10 }}>
              {manualAllocs.map((a) => (
                <div className="item" key={a.id}>
                  <div><b>{money(a.amount)}</b> <span className="hint">· {propName(a.property)}</span></div>
                  <button className="btn danger sm" onClick={() => delAlloc(a.id)}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 220px" }}>
              <label className="fld">Property</label>
              <select className="select" value={allocProp} onChange={(e) => setAllocProp(e.target.value)}>
                <option value="">— choose —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
              </select>
            </div>
            <div style={{ width: 140 }}>
              <label className="fld">Amount</label>
              <input className="input" type="number" value={allocAmt} onChange={(e) => setAllocAmt(e.target.value)} />
            </div>
            <button className="btn blue" onClick={addAlloc}>Allocate</button>
            {remaining > 0 && <button className="btn ghost" onClick={() => setAllocAmt(String(remaining))}>Fill remaining</button>}
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn ghost sm" onClick={() => setEditBill((v) => !v)}>{editBill ? "Close" : "Edit bill"}</button>
            <button className="btn danger sm" onClick={delBill}>Delete bill</button>
          </div>
          {editBill && (
            <div style={{ marginTop: 12 }}>
              <RecordForm fields={billFields} record={bill} onSave={saveBill} saving={saving} saveLabel="Save bill" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
/* --------------------------------- bills tab ------------------------------- */
function Bills({ accountId, notify, properties, contacts }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefill, setPrefill] = useState(null);       // AI-parsed draft for the add form
  const [parsedItems, setParsedItems] = useState([]); // line items shown under the form
  const [aiBusy, setAiBusy] = useState(false);
  const fileRef = useRef(null);
  async function refresh() {
    setLoading(true);
    try { setRows(await listBills(accountId)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId]);
  const addFields = [
    { key: "vendor_contact_id", label: "Vendor", type: "select", options: contacts.map((c) => ({ value: c.id, label: c.name })) },
    { key: "bill_date", label: "Bill date", type: "date" },
    { key: "due_date", label: "Due date", type: "date" },
    { key: "total_amount", label: "Total amount", type: "number" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "unpaid", label: "Unpaid" }, { value: "partial", label: "Partial" }, { value: "paid", label: "Paid" } ] },
    { key: "category", label: "Category" },
    { key: "recurring", label: "Recurring", type: "checkbox" },
    { key: "recurrence", label: "Recurrence", type: "select", options: [
      { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" }, { value: "annual", label: "Annual" } ] },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
  function startBlank() { setPrefill(null); setParsedItems([]); setAdding(true); }
  function cancelAdd() { setAdding(false); setPrefill(null); setParsedItems([]); }
  async function onPdf(e) {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { notify("Please choose a PDF bill."); return; }
    setAiBusy(true);
    try {
      const pdfBase64 = await fileToBase64(file);
      const d = await extractBill({ pdfBase64, fileName: file.name });
      // match vendor name to an existing contact
      const vn = (d.vendor_name || "").toLowerCase().trim();
      const match = vn ? contacts.find((c) => {
        const nm = (c.name || "").toLowerCase().trim();
        return nm === vn || nm.includes(vn) || vn.includes(nm);
      }) : null;
      const items = Array.isArray(d.line_items) ? d.line_items : [];
      const itemsNote = items.length
        ? "Line items:\n" + items.map((li) => `- ${li.description || "Item"}: $${li.amount}`).join("\n")
        : "";
      const notesBits = [d.vendor_name && !match ? `Vendor: ${d.vendor_name}` : "", itemsNote].filter(Boolean);
      setPrefill({
        status: "unpaid",
        vendor_contact_id: match ? match.id : undefined,
        bill_date: toIsoDate(d.bill_date),
        due_date: toIsoDate(d.due_date),
        total_amount: d.total_amount != null ? d.total_amount : "",
        category: d.category || "",
        notes: notesBits.join("\n\n"),
      });
      setParsedItems(items);
      setAdding(true);
      notify(match ? "Bill read — vendor matched. Review and save." : "Bill read — review and save." + (d.vendor_name ? ` (add "${d.vendor_name}" as a contact to link it)` : ""));
    } catch (err) {
      notify(err.message || "Could not read that bill.");
    } finally {
      setAiBusy(false);
    }
  }
  async function add(draft) {
    if (draft.total_amount === null || draft.total_amount === undefined || draft.total_amount === "") { notify("Enter a total"); return; }
    setSaving(true);
    const items = parsedItems;
    try {
      const bill = await bills.create({ account_id: accountId, status: "unpaid", ...draft });
      // Keep the charges the AI read so each can be assigned to a property.
      // Saved separately so a hiccup here never loses the bill itself.
      let lineNote = "";
      if (bill && items.length) {
        try {
          const saved = await saveBillLines(accountId, bill.id, items);
          lineNote = saved.length ? ` — ${saved.length} charges ready to assign` : "";
        } catch (e) {
          lineNote = " — but its charge lines didn't save; add them by hand";
        }
      }
      cancelAdd(); notify("Bill added" + lineNote); refresh();
    }
    catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}>
        {!adding && (
          <>
            <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={aiBusy}>
              {aiBusy ? "Reading…" : "⤓ Upload bill PDF"}
            </button>
            <button className="btn blue" onClick={startBlank}>+ Add bill</button>
          </>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={onPdf} style={{ display: "none" }} />
      </div>
      {adding && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <h3>{prefill ? "New bill (from PDF)" : "New bill"}</h3>
          {prefill && <div className="note" style={{ marginBottom: 12 }}>Fields below were read from your PDF — check the total, vendor and dates before saving.</div>}
          <RecordForm fields={addFields} record={prefill || { status: "unpaid" }} onSave={add} saving={saving} saveLabel="Add bill"
            extraButtons={<button className="btn ghost" onClick={cancelAdd}>Cancel</button>} />
          {parsedItems.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="hint" style={{ fontWeight: 700, color: "var(--nv)", marginBottom: 4 }}>Line items read from the bill</div>
              <div className="mini-list">
                {parsedItems.map((li, idx) => (
                  <div className="item" key={idx}>
                    <span className="hint">{li.description || "Item"}</span>
                    <b>{money(li.amount)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="hint" style={{ marginTop: 8 }}>After adding, open the bill to split it across properties.</div>
        </div></div>
      )}
      {loading ? <div className="hint">Loading…</div> : rows.length === 0 ? (
        <div className="hint">No bills yet.</div>
      ) : rows.map((b) => (
        <BillRow key={b.id} bill={b} accountId={accountId} notify={notify} properties={properties} contacts={contacts} refresh={refresh} />
      ))}
    </div>
  );
}
/* --------------------------- outstanding (to confirm) ---------------------- */
function Outstanding({ accountId, notify, refreshKey, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(null); // occurrence id
  const [amt, setAmt] = useState("");
  const [date, setDate] = useState("");
  const [method, setMethod] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setLoading(true);
    try { setRows(await listOutstanding(accountId)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId, refreshKey]);
  function startConfirm(o) {
    setConfirming(o.id);
    setAmt(o.expected_amount === null || o.expected_amount === undefined ? "" : String(o.expected_amount));
    setDate(o.due_date || todayStr());
    setMethod(o.method || "");
  }
  async function doConfirm(o) {
    setBusy(true);
    try {
      await confirmOccurrence(o, { amount: amt, date, method: method || null });
      notify("Logged");
      setConfirming(null);
      await refresh();
      onChanged && onChanged();
    } catch (e) { notify(e.message || "Could not log"); }
    finally { setBusy(false); }
  }
  async function doSkip(o) {
    if (!confirm("Skip this one? It won't be logged.")) return;
    try { await skipOccurrence(o.id); notify("Skipped"); await refresh(); onChanged && onChanged(); }
    catch (e) { notify(e.message || "Failed"); }
  }
  if (loading || rows.length === 0) return null;
  const today = todayStr();
  return (
    <div className="ll-card" style={{ marginBottom: 16, borderLeft: "3px solid var(--warn)" }}>
      <div className="pad">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <b style={{ color: "var(--nv)" }}>To confirm ({rows.length})</b>
          <span className="hint">Money due to come in or go out — confirm each to log it.</span>
        </div>
        <div>
          {rows.map((o) => {
            const overdue = o.due_date < today;
            const inflow = o.kind === "income";
            const who = inflow
              ? (o.property ? propName(o.property) : (o.source || o.label || "Income"))
              : (o.vendor?.name || o.label || (o.property ? propName(o.property) : "Expense"));
            return (
              <div key={o.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <b style={{ color: inflow ? "var(--ok)" : "var(--nv)" }}>{inflow ? "+" : "-"}{money(o.expected_amount)}</b>
                    <span className="hint"> · {who}{o.category ? " · " + o.category : ""}</span>
                    <div className="hint" style={{ color: overdue ? "var(--danger)" : "var(--muted)" }}>
                      {inflow ? "Expected" : "Due"} {fmtDate(o.due_date)}{overdue ? " · overdue" : ""}
                    </div>
                  </div>
                  {confirming !== o.id && (
                    <div style={{ whiteSpace: "nowrap" }}>
                      <button className="btn blue sm" onClick={() => startConfirm(o)}>Confirm</button>{" "}
                      <button className="btn ghost sm" onClick={() => doSkip(o)}>Skip</button>
                    </div>
                  )}
                </div>
                {confirming === o.id && (
                  <div className="row" style={{ alignItems: "flex-end", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ width: 130 }}>
                      <label className="fld">Amount</label>
                      <input className="input" type="number" value={amt} onChange={(e) => setAmt(e.target.value)} />
                    </div>
                    <div style={{ width: 150 }}>
                      <label className="fld">{inflow ? "Received on" : "Paid on"}</label>
                      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </div>
                    <div style={{ width: 130 }}>
                      <label className="fld">Method</label>
                      <select className="select" value={method} onChange={(e) => setMethod(e.target.value)}>
                        <option value="">—</option>
                        {PAY_METHODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <button className="btn blue" disabled={busy} onClick={() => doConfirm(o)}>{busy ? "Saving…" : "Log it"}</button>
                    <button className="btn ghost" onClick={() => setConfirming(null)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
/* ------------------------------ recurring tab ------------------------------ */
function Recurring({ accountId, notify, properties, contacts, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // id | "new" | null
  const [saving, setSaving] = useState(false);
  async function refresh() {
    setLoading(true);
    try { setRows(await listSchedules(accountId)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId]);
  const propOpts = properties.map((p) => ({ value: p.id, label: propName(p) }));
  const vendorOpts = contacts.map((c) => ({ value: c.id, label: c.name }));
  const fields = [
    { key: "kind", label: "Type", type: "select", options: RECUR_KINDS },
    { key: "label", label: "Name", placeholder: "e.g. Rent - 123 Main" },
    { key: "amount", label: "Expected amount", type: "number" },
    { key: "interval_months", label: "Frequency", type: "select", options: RECUR_INTERVALS },
    { key: "day_of_month", label: "Day of month due", type: "number", placeholder: "1" },
    { key: "start_date", label: "Starts", type: "date" },
    { key: "end_date", label: "Ends (optional)", type: "date" },
    { key: "property_id", label: "Property", type: "select", options: propOpts },
    { key: "vendor_contact_id", label: "Vendor (expense / bill)", type: "select", options: vendorOpts },
    { key: "category", label: "Category", placeholder: "rent / mortgage / insurance" },
    { key: "method", label: "Method", type: "select", options: PAY_METHODS },
    { key: "active", label: "Active", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea" },
  ];
  async function save(draft) {
    const kind = draft.kind || "income";
    if (draft.amount === null || draft.amount === undefined || draft.amount === "") { notify("Enter an expected amount"); return; }
    if (!draft.start_date) { notify("Pick a start date"); return; }
    if (kind === "income" && !draft.property_id) { notify("Pick a property for income"); return; }
    const payload = {
      ...draft,
      kind,
      amount: Number(draft.amount),
      interval_months: Number(draft.interval_months) || 1,
      day_of_month: Number(draft.day_of_month) || 1,
      active: draft.active === undefined ? true : !!draft.active,
    };
    setSaving(true);
    try {
      if (editing === "new") await recurring.create({ account_id: accountId, ...payload });
      else await recurring.update(editing, payload);
      setEditing(null); notify("Saved");
      await refresh();
      onChanged && onChanged();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del(id) {
    if (!confirm("Delete this schedule? Already-logged entries stay; future ones stop.")) return;
    try { await recurring.remove(id); notify("Deleted"); await refresh(); onChanged && onChanged(); }
    catch (e) { notify(e.message || "Delete failed"); }
  }
  async function togglePause(r) {
    try { await recurring.update(r.id, { active: !r.active }); notify(r.active ? "Paused" : "Resumed"); await refresh(); onChanged && onChanged(); }
    catch (e) { notify(e.message || "Failed"); }
  }
  const editRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) : null;
  const defaultRecord = { kind: "income", interval_months: 1, day_of_month: 1, active: true, start_date: todayStr(), category: "rent" };
  return (
    <div>
      <div className="hint" style={{ marginBottom: 12 }}>
        Set up rent, mortgage, insurance and other repeating items. On each due date they appear under <b>To confirm</b> at
        the top of Financials — confirm the money moved and it's logged for you. A bill-type item creates a paid bill each
        cycle; open it under Bills to split it across properties.
      </div>
      {loading ? <div className="hint">Loading…</div> : rows.length === 0 && editing !== "new" ? (
        <div className="hint" style={{ marginBottom: 12 }}>No recurring items yet.</div>
      ) : (
        <div className="mini-list" style={{ marginBottom: 14 }}>
          {rows.map((r) => (
            <div className="item" key={r.id} style={{ opacity: r.active ? 1 : 0.55 }}>
              <div>
                <b>{r.label || (r.kind === "income" ? "Income" : r.kind === "bill" ? "Bill" : "Expense")} · {money(r.amount)}</b>
                <span className="hint"> · {intervalLabel(r.interval_months)} · day {r.day_of_month}
                  {r.property ? " · " + propName(r.property) : ""}
                  {r.vendor?.name ? " · " + r.vendor.name : ""}
                  {!r.active ? " · paused" : ""}</span>
              </div>
              <div style={{ whiteSpace: "nowrap" }}>
                <button className="btn ghost sm" onClick={() => togglePause(r)}>{r.active ? "Pause" : "Resume"}</button>{" "}
                <button className="btn ghost sm" onClick={() => setEditing(r.id)}>Edit</button>{" "}
                <button className="btn danger sm" onClick={() => del(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {editing ? (
        <div className="ll-card"><div className="pad">
          <h3>{editing === "new" ? "New recurring item" : "Edit recurring item"}</h3>
          <div className="hint" style={{ marginBottom: 10 }}>
            Editing the amount only changes future due dates — anything already waiting to confirm keeps its original amount.
          </div>
          <RecordForm fields={fields} record={editRow || defaultRecord} onSave={save} saving={saving}
            extraButtons={<button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>} />
        </div></div>
      ) : (
        <button className="btn blue" onClick={() => setEditing("new")}>+ Add recurring item</button>
      )}
    </div>
  );
}
/* --------------------------------- main ------------------------------------ */
export default function LandlordFinancials({ membership, notify, initialTab }) {
  const accountId = membership.account_id;
  const [tab, setTab] = useState(initialTab || "Income");
  const [properties, setProperties] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [ready, setReady] = useState(false);
  const [outKey, setOutKey] = useState(0); // bump to refresh the "to confirm" list
  useEffect(() => {
    (async () => {
      try {
        const [ps, cs] = await Promise.all([listProperties(accountId), contactsApi.list({ account_id: accountId }, "name")]);
        setProperties(ps); setContacts(cs);
      } catch (e) { notify(e.message || "Load failed"); }
      finally { setReady(true); }
    })();
    ensureOccurrences(accountId).then(() => setOutKey((k) => k + 1)).catch(() => {});
    /* eslint-disable-next-line */
  }, [accountId]);
  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);
  async function regen() {
    try { await ensureOccurrences(accountId); } catch (e) { /* ignore */ }
    setOutKey((k) => k + 1);
  }
  return (
    <div className="ll-content">
      <Outstanding accountId={accountId} notify={notify} refreshKey={outKey} onChanged={() => setOutKey((k) => k + 1)} />
      <div className="tabs">
        {["Income", "Expenses", "Bills", "Recurring"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {!ready ? <div className="hint">Loading…</div> : (
        <>
          {tab === "Income" && <Ledger kind="income" api={income} load={listIncome} accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
          {tab === "Expenses" && <Ledger kind="expense" api={expenses} load={listExpenses} accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
          {tab === "Bills" && <Bills accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
          {tab === "Recurring" && <Recurring accountId={accountId} notify={notify} properties={properties} contacts={contacts} onChanged={regen} />}
        </>
      )}
    </div>
  );
}
