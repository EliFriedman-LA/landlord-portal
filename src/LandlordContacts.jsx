import React, { useEffect, useMemo, useState } from "react";
import { contacts as contactsApi, listContactsWithProps } from "./landlordProps.js";
import { RecordForm } from "./landlordForm.jsx";

const ROLES = [
  "attorney", "broker", "mortgage_broker", "registration_agent", "management",
  "insurance_broker", "tenant", "vendor", "lender", "other",
];
const roleLabel = (r) => (r ? r.replace(/_/g, " ") : "");
const propName = (p) => (p ? p.label || p.full_address || "Property" : "");

const FIELDS = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role", type: "select", options: ROLES.map((r) => ({ value: r, label: roleLabel(r) })) },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "notes", label: "Notes", type: "textarea" },
];

export default function LandlordContacts({ membership, notify }) {
  const accountId = membership.account_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [editing, setEditing] = useState(null); // id | "new" | null
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try { setRows(await listContactsWithProps(accountId)); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (roleFilter && c.role !== roleFilter) return false;
      if (!needle) return true;
      return [c.name, c.company, c.email, c.phone].filter(Boolean).some((v) => v.toLowerCase().includes(needle));
    });
  }, [rows, q, roleFilter]);

  async function save(draft) {
    if (!draft.name?.trim()) { notify("Name is required"); return; }
    setSaving(true);
    try {
      if (editing === "new") await contactsApi.create({ account_id: accountId, ...draft });
      else await contactsApi.update(editing, draft);
      setEditing(null); notify("Saved"); refresh();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del(id) {
    if (!confirm("Delete this contact? It will also be removed from any properties it's assigned to.")) return;
    try { await contactsApi.remove(id); notify("Deleted"); refresh(); } catch (e) { notify(e.message || "Delete failed"); }
  }

  const editRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) : null;

  return (
    <div className="ll-content">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ minWidth: 220 }}>
            <label className="fld">Search</label>
            <input className="input" placeholder="Name, company, email…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ minWidth: 170 }}>
            <label className="fld">Role</label>
            <select className="select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="">All roles</option>
              {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </div>
        </div>
        {!editing && <button className="btn blue" onClick={() => setEditing("new")}>+ Add contact</button>}
      </div>

      {editing && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <h3>{editing === "new" ? "New contact" : "Edit contact"}</h3>
          <RecordForm fields={FIELDS} record={editRow || {}} onSave={save} saving={saving}
            saveLabel={editing === "new" ? "Add contact" : "Save"}
            extraButtons={<button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>} />
        </div></div>
      )}

      {loading ? <div className="hint">Loading…</div> : shown.length === 0 ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">{rows.length === 0 ? "No contacts yet" : "No matches"}</div>
          <div className="hint">{rows.length === 0 ? "Add attorneys, brokers, vendors, tenants and more — then assign them to properties." : "Try a different search or role."}</div>
        </div></div>
      ) : (
        <div className="ll-grid cols">
          {shown.map((c) => (
            <div key={c.id} className="ll-card"><div className="pad">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <h3 style={{ marginBottom: 2 }}>{c.name}</h3>
                {c.role && <span className="badge member">{roleLabel(c.role)}</span>}
              </div>
              {c.company && <div className="hint">{c.company}</div>}
              <div className="hint" style={{ marginTop: 6 }}>
                {c.phone && <div>{c.phone}</div>}
                {c.email && <div><a href={`mailto:${c.email}`}>{c.email}</a></div>}
              </div>
              {(c.links || []).length > 0 && (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {c.links.map((l, i) => l.property && (
                    <span key={i} className="chip">{propName(l.property)}{l.role ? ` · ${roleLabel(l.role)}` : ""}</span>
                  ))}
                </div>
              )}
              {c.notes && <div className="hint" style={{ marginTop: 8 }}>{c.notes}</div>}
              <div className="row" style={{ marginTop: 12 }}>
                <button className="btn ghost sm" onClick={() => setEditing(c.id)}>Edit</button>
                <button className="btn danger sm" onClick={() => del(c.id)}>Delete</button>
              </div>
            </div></div>
          ))}
        </div>
      )}
    </div>
  );
}
