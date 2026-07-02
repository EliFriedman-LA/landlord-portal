import React, { useEffect, useMemo, useState } from "react";
import {
  listTasks, createTask, updateTask, removeTask, setTaskDone,
  createReminder, getUpcoming,
} from "./landlordTasks.js";
import { listProperties } from "./landlordProps.js";
import { RecordForm } from "./landlordForm.jsx";

const propName = (p) => (p ? p.label || p.full_address || "Property" : "—");
const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "");
function daysFromNow(d) {
  if (!d) return null;
  const ms = new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime();
  return Math.round(ms / 86400000);
}
function whenLabel(days) {
  if (days === null) return "";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/* -------------------------------- to-dos -------------------------------- */
function Todos({ accountId, notify, properties }) {
  const [rows, setRows] = useState([]);
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setRows(await listTasks(accountId, showDone)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId, showDone]);

  const fields = useMemo(() => [
    { key: "title", label: "Task" },
    { key: "property_id", label: "Property (optional)", type: "select", options: properties.map((p) => ({ value: p.id, label: propName(p) })) },
    { key: "due_date", label: "Due date", type: "date" },
    { key: "priority", label: "Priority", type: "select", options: [
      { value: "low", label: "Low" }, { value: "normal", label: "Normal" }, { value: "high", label: "High" } ] },
    { key: "description", label: "Notes", type: "textarea" },
  ], [properties]);

  async function save(draft) {
    if (!draft.title?.trim()) { notify("Give the task a title"); return; }
    setSaving(true);
    try {
      if (editing === "new") await createTask({ account_id: accountId, status: "open", priority: "normal", ...draft });
      else await updateTask(editing, draft);
      setEditing(null); notify("Saved"); refresh();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function toggle(t) {
    try { await setTaskDone(t, t.status !== "done"); refresh(); } catch (e) { notify(e.message || "Update failed"); }
  }
  async function del(id) {
    if (!confirm("Delete this task?")) return;
    try { await removeTask(id); notify("Deleted"); refresh(); } catch (e) { notify(e.message || "Delete failed"); }
  }

  const editRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) : null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <label className="chk"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed</label>
        {!editing && <button className="btn blue" onClick={() => setEditing("new")}>+ Add task</button>}
      </div>

      {editing && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <RecordForm fields={fields} record={editRow || { priority: "normal" }} onSave={save} saving={saving}
            saveLabel={editing === "new" ? "Add task" : "Save"}
            extraButtons={<button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>} />
        </div></div>
      )}

      {loading ? <div className="hint">Loading…</div> : rows.length === 0 ? (
        <div className="hint">Nothing here. Add a task, or check the Upcoming tab for renewals coming due.</div>
      ) : (
        <div className="mini-list">
          {rows.map((t) => {
            const d = daysFromNow(t.due_date);
            const overdue = t.status !== "done" && d !== null && d < 0;
            return (
              <div className="item" key={t.id}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="checkbox" checked={t.status === "done"} onChange={() => toggle(t)} style={{ marginTop: 3 }} />
                  <div>
                    <b style={{ textDecoration: t.status === "done" ? "line-through" : "none", opacity: t.status === "done" ? .6 : 1 }}>{t.title}</b>
                    {t.priority === "high" && <span className="badge pending" style={{ marginLeft: 8 }}>high</span>}
                    <div className="hint">
                      {t.property?.id ? propName(t.property) : "General"}
                      {t.due_date ? <> · due {fmtDate(t.due_date)} <span style={{ color: overdue ? "var(--danger)" : "var(--muted)" }}>({whenLabel(d)})</span></> : ""}
                    </div>
                    {t.description && <div className="hint" style={{ marginTop: 2 }}>{t.description}</div>}
                  </div>
                </div>
                <div style={{ whiteSpace: "nowrap" }}>
                  <button className="btn ghost sm" onClick={() => setEditing(t.id)}>Edit</button>{" "}
                  <button className="btn danger sm" onClick={() => del(t.id)}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ upcoming ------------------------------- */
const TYPE_COLORS = {
  "LLC renewal": "#6d28d9", "Insurance": "#0369a1", "Registration": "#b45309",
  "Lease end": "#be123c", "Lease reminder": "#be123c", "Property tax": "#047857",
  "Loan maturity": "#1e3a5f", "Reminder": "#334155",
};

function Upcoming({ accountId, notify, properties }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [horizon, setHorizon] = useState(90);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setItems(await getUpcoming(accountId)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId]);

  const shown = useMemo(() => items
    .map((it) => ({ ...it, days: daysFromNow(it.date) }))
    .filter((it) => it.days !== null && it.days <= horizon)
    .sort((a, b) => a.days - b.days), [items, horizon]);

  async function addReminder(draft) {
    if (!draft.title?.trim() || !draft.remind_date) { notify("Title and date required"); return; }
    setSaving(true);
    try {
      await createReminder({ account_id: accountId, title: draft.title.trim(), remind_date: draft.remind_date, property_id: draft.property_id || null, type: "custom" });
      setAdding(false); notify("Reminder added"); refresh();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }

  const reminderFields = [
    { key: "title", label: "Reminder" },
    { key: "remind_date", label: "Date", type: "date" },
    { key: "property_id", label: "Property (optional)", type: "select", options: properties.map((p) => ({ value: p.id, label: propName(p) })) },
  ];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
        <div style={{ minWidth: 180 }}>
          <label className="fld">Show the next</label>
          <select className="select" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={180}>6 months</option>
            <option value={3650}>Everything</option>
          </select>
        </div>
        {!adding && <button className="btn ghost" onClick={() => setAdding(true)}>+ Add reminder</button>}
      </div>

      {adding && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <RecordForm fields={reminderFields} record={{}} onSave={addReminder} saving={saving} saveLabel="Add reminder"
            extraButtons={<button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>} />
        </div></div>
      )}

      {loading ? <div className="hint">Loading…</div> : shown.length === 0 ? (
        <div className="hint">Nothing due in this window. Renewal dates you enter on properties (insurance, registrations, LLC, leases, tax, loans) show up here automatically.</div>
      ) : (
        <div className="mini-list">
          {shown.map((it) => {
            const overdue = it.days < 0;
            const soon = it.days >= 0 && it.days <= 30;
            return (
              <div className="item" key={it.id}>
                <div>
                  <span className="badge" style={{ background: (TYPE_COLORS[it.type] || "#334155") + "22", color: TYPE_COLORS[it.type] || "#334155", marginRight: 8 }}>{it.type}</span>
                  <b>{it.label}</b>
                  <span className="hint">{it.property ? " · " + it.property : ""}</span>
                  <div className="hint">
                    {fmtDate(it.date)} · <span style={{ color: overdue ? "var(--danger)" : soon ? "var(--warn)" : "var(--muted)", fontWeight: overdue || soon ? 700 : 400 }}>{whenLabel(it.days)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- main -------------------------------- */
export default function LandlordTasks({ membership, notify }) {
  const accountId = membership.account_id;
  const [tab, setTab] = useState("To-dos");
  const [properties, setProperties] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try { setProperties(await listProperties(accountId)); }
      catch (e) { notify(e.message || "Load failed"); }
      finally { setReady(true); }
    })();
    /* eslint-disable-next-line */
  }, [accountId]);

  return (
    <div className="ll-content">
      <div className="tabs">
        {["To-dos", "Upcoming"].map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {!ready ? <div className="hint">Loading…</div> : tab === "To-dos"
        ? <Todos accountId={accountId} notify={notify} properties={properties} />
        : <Upcoming accountId={accountId} notify={notify} properties={properties} />}
    </div>
  );
}
