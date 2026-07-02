import React, { useEffect, useMemo, useState } from "react";
import {
  listIncome, listExpenses, listBills,
  income, expenses, bills, billAllocations, PAY_METHODS, money,
} from "./landlordMoney.js";
import { listProperties, contacts as contactsApi } from "./landlordProps.js";
import { RecordForm } from "./landlordForm.jsx";

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "");
const propName = (p) => (p ? p.label || p.full_address || "Property" : "—");

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

/* -------------------------------- bill row -------------------------------- */
function BillRow({ bill, accountId, notify, properties, contacts, refresh }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editBill, setEditBill] = useState(false);
  const [allocProp, setAllocProp] = useState("");
  const [allocAmt, setAllocAmt] = useState("");

  const allocated = (bill.allocations || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const remaining = (Number(bill.total_amount) || 0) - allocated;

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
          <div style={{ fontWeight: 600, color: "var(--nv)", marginBottom: 8 }}>Split across properties</div>
          {(bill.allocations || []).length > 0 && (
            <div className="mini-list" style={{ marginBottom: 10 }}>
              {bill.allocations.map((a) => (
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

  async function add(draft) {
    if (draft.total_amount === null || draft.total_amount === undefined || draft.total_amount === "") { notify("Enter a total"); return; }
    setSaving(true);
    try { await bills.create({ account_id: accountId, status: "unpaid", ...draft }); setAdding(false); notify("Bill added"); refresh(); }
    catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {!adding && <button className="btn blue" onClick={() => setAdding(true)}>+ Add bill</button>}
      </div>
      {adding && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <h3>New bill</h3>
          <RecordForm fields={addFields} record={{ status: "unpaid" }} onSave={add} saving={saving} saveLabel="Add bill"
            extraButtons={<button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>} />
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

/* --------------------------------- main ------------------------------------ */
export default function LandlordFinancials({ membership, notify, initialTab }) {
  const accountId = membership.account_id;
  const [tab, setTab] = useState(initialTab || "Income");
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

  useEffect(() => { if (initialTab) setTab(initialTab); }, [initialTab]);

  return (
    <div className="ll-content">
      <div className="tabs">
        {["Income", "Expenses", "Bills"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {!ready ? <div className="hint">Loading…</div> : (
        <>
          {tab === "Income" && <Ledger kind="income" api={income} load={listIncome} accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
          {tab === "Expenses" && <Ledger kind="expense" api={expenses} load={listExpenses} accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
          {tab === "Bills" && <Bills accountId={accountId} notify={notify} properties={properties} contacts={contacts} />}
        </>
      )}
    </div>
  );
}
