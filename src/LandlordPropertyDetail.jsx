import React, { useEffect, useMemo, useState } from "react";
import {
  getProperty, updateProperty, deleteProperty,
  entities, loans, insurance, propertyTax, units, splits, registrations,
  tenants, leases, listLeases, contacts, listPropertyContacts, assignContact, unassignContact,
  listDocuments,
} from "./landlordProps.js";
import { RecordForm, Field } from "./landlordForm.jsx";

/* -------------------------------- schemas -------------------------------- */
const TYPE_OPTS = [
  { value: "sfr", label: "Single family" }, { value: "multi", label: "Multi-family" },
  { value: "condo", label: "Condo" }, { value: "mixed", label: "Mixed use" }, { value: "land", label: "Land" },
];
const STATUS_OPTS = [
  { value: "active", label: "Active" }, { value: "prospect", label: "Prospect" }, { value: "sold", label: "Sold" },
];

const OVERVIEW = [
  { key: "label", label: "Name / nickname" },
  { key: "full_address", label: "Full address", full: true },
  { key: "city", label: "City" }, { key: "state", label: "State" }, { key: "zip", label: "ZIP" },
  { key: "county", label: "County" }, { key: "block", label: "Block" }, { key: "lot", label: "Lot" },
  { key: "lot_size", label: "Lot size" }, { key: "building_sf", label: "Building SF", type: "number" },
  { key: "unit_count", label: "Units", type: "number" }, { key: "bed_count", label: "Beds", type: "number" },
  { key: "bath_count", label: "Baths", type: "number" },
  { key: "property_type", label: "Type", type: "select", options: TYPE_OPTS },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTS },
  { key: "access_code", label: "Access code" }, { key: "acquired_date", label: "Acquired date", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const PURCHASE = [
  { key: "purchase_price", label: "Purchase price", type: "number" },
  { key: "appraised_value", label: "Appraised value", type: "number" },
  { key: "appraisal_date", label: "Appraisal date", type: "date" },
  { key: "appraisal_url", label: "Appraisal report link", type: "url", full: true },
  { key: "zillow_url", label: "Zillow link", type: "url", full: true },
  { key: "renovation_cost", label: "Renovation cost", type: "number" },
  { key: "total_actual_cost", label: "Total actual cost", type: "number" },
  { key: "cash_out", label: "Cash out", type: "number" },
];
const LOAN = [
  { key: "lender", label: "Lender" }, { key: "amount", label: "Loan amount", type: "number" },
  { key: "interest_rate", label: "Interest rate %", type: "number" }, { key: "loan_type", label: "Loan type" },
  { key: "ltv", label: "LTV %", type: "number" }, { key: "prepay_terms", label: "Prepay terms" },
  { key: "monthly_payment", label: "Monthly payment", type: "number" }, { key: "autopay_date", label: "Autopay date" },
  { key: "cash_out", label: "Cash out", type: "number" },
  { key: "origination_date", label: "Origination date", type: "date" }, { key: "maturity_date", label: "Maturity date", type: "date" },
  { key: "escrow", label: "Taxes/ins escrowed", type: "checkbox" },
  { key: "portal_url", label: "Loan portal", type: "url", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];
const INSURANCE = [
  { key: "carrier", label: "Carrier" }, { key: "policy_number", label: "Policy number" },
  { key: "admitted", label: "Admitted carrier", type: "checkbox" },
  { key: "dwelling_amount", label: "Dwelling amount", type: "number" },
  { key: "liability_amount", label: "Liability amount", type: "number" },
  { key: "rent_loss_amount", label: "Rent loss amount", type: "number" },
  { key: "premium", label: "Premium", type: "number" }, { key: "deductible", label: "Deductible", type: "number" },
  { key: "dwelling_per_sf", label: "Dwelling $/SF", type: "number" }, { key: "premium_per_sf", label: "Premium $/SF", type: "number" },
  { key: "effective_date", label: "Effective date", type: "date" }, { key: "expiration_date", label: "Expiration date", type: "date" },
  { key: "escrowed", label: "Escrowed by lender", type: "checkbox" },
  { key: "portal_url", label: "Insurance portal", type: "url", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];
const TAX = [
  { key: "annual_amount", label: "Annual amount", type: "number" },
  { key: "parcel_id", label: "Parcel ID" },
  { key: "website_url", label: "Tax website / portal", type: "url", full: true },
  { key: "paid_via", label: "Paid via", type: "select", options: [{ value: "escrow", label: "Escrow" }, { value: "owner", label: "Owner" }] },
  { key: "due_date", label: "Next due date", type: "date" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const UNIT = [
  { key: "label", label: "Unit label" }, { key: "beds", label: "Beds", type: "number" },
  { key: "baths", label: "Baths", type: "number" }, { key: "sf", label: "SF", type: "number" },
  { key: "market_rent", label: "Market rent", type: "number" },
  { key: "status", label: "Status", type: "select", options: [{ value: "occupied", label: "Occupied" }, { value: "vacant", label: "Vacant" }] },
  { key: "notes", label: "Notes", type: "textarea" },
];
const SPLIT = [
  { key: "partner_name", label: "Partner" },
  { key: "pct_prior", label: "% prior to split", type: "number" },
  { key: "pct_after", label: "% after split", type: "number" },
  { key: "is_iska", label: "Iska share", type: "checkbox" },
  { key: "notes", label: "Notes", type: "textarea" },
];
const REG = [
  { key: "type", label: "Type", type: "select", options: [
    { value: "rental_license", label: "Rental license" }, { value: "coo", label: "Certificate of occupancy" },
    { value: "llc_registration", label: "LLC registration" }, { value: "other", label: "Other" } ] },
  { key: "authority", label: "Authority" }, { key: "number", label: "Number" },
  { key: "issue_date", label: "Issue date", type: "date" }, { key: "expiration_date", label: "Expiration date", type: "date" },
  { key: "renewal_url", label: "Renewal link", type: "url", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];
const ENTITY = [
  { key: "name", label: "LLC name" }, { key: "ein", label: "EIN" }, { key: "state", label: "State" },
  { key: "registered_agent", label: "Registered agent" },
  { key: "formation_date", label: "Formation date", type: "date" },
  { key: "annual_renewal_date", label: "Annual renewal date", type: "date" },
  { key: "renewal_url", label: "Renewal link", type: "url", full: true },
  { key: "notes", label: "Notes", type: "textarea" },
];
const CONTACT_ROLES = [
  "attorney", "broker", "mortgage_broker", "registration_agent", "management", "insurance_broker", "tenant", "vendor", "lender", "other",
];

const fmtDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString() : "");
const money = (n) => (n === null || n === undefined || n === "" ? "" : "$" + Number(n).toLocaleString());

/* --------------------- single-record child-table tab --------------------- */
function SingleTab({ api, propertyId, accountId, fields, notify, emptyLabel }) {
  const [rec, setRec] = useState(undefined);
  const [saving, setSaving] = useState(false);
  async function load() {
    try { const rows = await api.list({ property_id: propertyId }); setRec(rows[0] || null); }
    catch (e) { notify(e.message || "Load failed"); setRec(null); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [propertyId]);
  async function save(draft) {
    setSaving(true);
    try {
      if (rec?.id) await api.update(rec.id, draft);
      else await api.create({ account_id: accountId, property_id: propertyId, ...draft });
      notify("Saved");
      load();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  if (rec === undefined) return <div className="hint">Loading…</div>;
  return <RecordForm fields={fields} record={rec || {}} onSave={save} saving={saving} />;
}

/* ---------------------------- generic list tab --------------------------- */
function ListTab({ api, propertyId, accountId, fields, notify, summary, blank = {} }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // id | "new" | null
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setRows(await api.list({ property_id: propertyId })); }
    catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [propertyId]);

  async function save(draft) {
    setSaving(true);
    try {
      if (editing === "new") await api.create({ account_id: accountId, property_id: propertyId, ...draft });
      else await api.update(editing, draft);
      setEditing(null); notify("Saved"); load();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del(id) {
    if (!confirm("Delete this entry?")) return;
    try { await api.remove(id); notify("Deleted"); load(); } catch (e) { notify(e.message || "Delete failed"); }
  }

  const editRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) : null;

  return (
    <div>
      {loading ? <div className="hint">Loading…</div> : rows.length === 0 && editing !== "new" ? (
        <div className="hint" style={{ marginBottom: 12 }}>Nothing added yet.</div>
      ) : (
        <div className="mini-list" style={{ marginBottom: 14 }}>
          {rows.map((r) => (
            <div className="item" key={r.id}>
              <div>{summary(r)}</div>
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
          <RecordForm fields={fields} record={editRow || blank} onSave={save} saving={saving}
            extraButtons={<button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>} />
        </div></div>
      ) : (
        <button className="btn ghost" onClick={() => setEditing("new")}>+ Add</button>
      )}
    </div>
  );
}

/* ------------------------------ leases tab ------------------------------- */
function LeasesTab({ propertyId, accountId, notify }) {
  const [rows, setRows] = useState([]);
  const [tenantList, setTenantList] = useState([]);
  const [unitList, setUnitList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newTenant, setNewTenant] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [ls, ts, us] = await Promise.all([
        listLeases(propertyId), tenants.list({ account_id: accountId }, "name"), units.list({ property_id: propertyId }),
      ]);
      setRows(ls); setTenantList(ts); setUnitList(us);
    } catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [propertyId]);

  const fields = useMemo(() => [
    { key: "tenant_id", label: "Tenant", type: "select", options: tenantList.map((t) => ({ value: t.id, label: t.name })) },
    { key: "unit_id", label: "Unit (optional)", type: "select", options: unitList.map((u) => ({ value: u.id, label: u.label || "Unit" })) },
    { key: "rent_amount", label: "Rent amount", type: "number" },
    { key: "start_date", label: "Lease start", type: "date" }, { key: "end_date", label: "Lease end", type: "date" },
    { key: "deposit", label: "Security deposit", type: "number" }, { key: "access_code", label: "Access code" },
    { key: "renewal_reminder_date", label: "Renewal reminder", type: "date" },
    { key: "rent_hike_note", label: "Rent-hike note" },
    { key: "lease_doc_url", label: "Lease document link", type: "url", full: true },
    { key: "status", label: "Status", type: "select", options: [
      { value: "active", label: "Active" }, { value: "notice", label: "Notice given" },
      { value: "expired", label: "Expired" }, { value: "ended", label: "Ended" } ] },
    { key: "notes", label: "Notes", type: "textarea" },
  ], [tenantList, unitList]);

  async function save(draft) {
    setSaving(true);
    try {
      let tenant_id = draft.tenant_id;
      if (newTenant.trim()) {
        const t = await tenants.create({ account_id: accountId, name: newTenant.trim() });
        tenant_id = t.id;
      }
      const payload = { ...draft, tenant_id };
      if (editing === "new") await leases.create({ account_id: accountId, property_id: propertyId, ...payload });
      else await leases.update(editing, payload);
      setEditing(null); setNewTenant(""); notify("Saved"); load();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del(id) {
    if (!confirm("Delete this lease?")) return;
    try { await leases.remove(id); notify("Deleted"); load(); } catch (e) { notify(e.message || "Delete failed"); }
  }

  const editRow = editing && editing !== "new" ? rows.find((r) => r.id === editing) : null;

  return (
    <div>
      {loading ? <div className="hint">Loading…</div> : rows.length === 0 && editing !== "new" ? (
        <div className="hint" style={{ marginBottom: 12 }}>No leases yet.</div>
      ) : (
        <div className="mini-list" style={{ marginBottom: 14 }}>
          {rows.map((r) => (
            <div className="item" key={r.id}>
              <div>
                <b>{r.tenant?.name || "Tenant"}</b>
                <span className="hint"> · {money(r.rent_amount)}/mo · {fmtDate(r.start_date)}–{fmtDate(r.end_date)} · {r.status}</span>
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
          {tenantList.length === 0 && (
            <div className="note" style={{ marginBottom: 12 }}>No tenants on file yet — type a name below to create one with this lease.</div>
          )}
          <div style={{ marginBottom: 12 }}>
            <label className="fld">New tenant (optional — overrides the dropdown)</label>
            <input className="input" placeholder="Tenant full name" value={newTenant} onChange={(e) => setNewTenant(e.target.value)} />
          </div>
          <RecordForm fields={fields} record={editRow || { status: "active" }} onSave={save} saving={saving}
            extraButtons={<button className="btn ghost" onClick={() => { setEditing(null); setNewTenant(""); }}>Cancel</button>} />
        </div></div>
      ) : (
        <button className="btn ghost" onClick={() => setEditing("new")}>+ Add lease</button>
      )}
    </div>
  );
}

/* ------------------------------ entity tab ------------------------------- */
function EntityTab({ property, accountId, notify, onLinked }) {
  const [list, setList] = useState([]);
  const [linkedId, setLinkedId] = useState(property.entity_id || "");
  const [rec, setRec] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState("view"); // view | new

  async function load() {
    try {
      const es = await entities.list({ account_id: accountId }, "name");
      setList(es);
      const cur = es.find((e) => e.id === property.entity_id) || null;
      setRec(cur); setLinkedId(property.entity_id || "");
    } catch (e) { notify(e.message || "Load failed"); setRec(null); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [property.id]);

  async function linkExisting(id) {
    setLinkedId(id);
    try {
      await updateProperty(property.id, { entity_id: id || null });
      setRec(list.find((e) => e.id === id) || null);
      onLinked();
      notify("Entity linked");
    } catch (e) { notify(e.message || "Link failed"); }
  }
  async function saveEntity(draft) {
    setSaving(true);
    try {
      if (mode === "new" || !rec?.id) {
        const created = await entities.create({ account_id: accountId, ...draft });
        await updateProperty(property.id, { entity_id: created.id });
        setMode("view"); onLinked();
      } else {
        await entities.update(rec.id, draft);
      }
      notify("Saved"); load();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }

  if (rec === undefined) return <div className="hint">Loading…</div>;

  return (
    <div>
      <div className="row" style={{ alignItems: "flex-end", marginBottom: 16 }}>
        <div style={{ minWidth: 260 }}>
          <label className="fld">Linked LLC</label>
          <select className="select" value={linkedId} onChange={(e) => { setMode("view"); linkExisting(e.target.value); }}>
            <option value="">— none —</option>
            {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <button className="btn ghost" onClick={() => { setMode("new"); setRec({}); }}>+ New LLC</button>
      </div>
      {(rec || mode === "new") ? (
        <div className="ll-card"><div className="pad">
          <RecordForm fields={ENTITY} record={mode === "new" ? {} : rec} onSave={saveEntity} saving={saving}
            saveLabel={mode === "new" ? "Create & link" : "Save LLC"} />
        </div></div>
      ) : (
        <div className="hint">Link an existing LLC above, or create a new one.</div>
      )}
    </div>
  );
}

/* ------------------------------ contacts tab ----------------------------- */
function ContactsTab({ propertyId, accountId, notify }) {
  const [assigned, setAssigned] = useState([]);
  const [book, setBook] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pickId, setPickId] = useState("");
  const [role, setRole] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([listPropertyContacts(propertyId), contacts.list({ account_id: accountId }, "name")]);
      setAssigned(a); setBook(b);
    } catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [propertyId]);

  async function assign() {
    if (!pickId) return;
    try { await assignContact({ account_id: accountId, property_id: propertyId, contact_id: pickId, role: role || null }); setPickId(""); setRole(""); notify("Contact added"); load(); }
    catch (e) { notify(e.message || "Could not add"); }
  }
  async function newContact(draft) {
    if (!draft.name) { notify("Name required"); return; }
    setSaving(true);
    try {
      const c = await contacts.create({ account_id: accountId, ...draft });
      await assignContact({ account_id: accountId, property_id: propertyId, contact_id: c.id, role: draft.role || null });
      setAdding(false); notify("Contact added"); load();
    } catch (e) { notify(e.message || "Could not add"); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {loading ? <div className="hint">Loading…</div> : (
        <>
          {assigned.length > 0 && (
            <div className="mini-list" style={{ marginBottom: 16 }}>
              {assigned.map((a) => (
                <div className="item" key={a.id}>
                  <div>
                    <b>{a.contact?.name}</b>
                    <span className="hint"> · {a.role || a.contact?.role || "contact"}{a.contact?.company ? " · " + a.contact.company : ""}
                      {a.contact?.phone ? " · " + a.contact.phone : ""}{a.contact?.email ? " · " + a.contact.email : ""}</span>
                  </div>
                  <button className="btn danger sm" onClick={async () => { await unassignContact(a.id); notify("Removed"); load(); }}>Remove</button>
                </div>
              ))}
            </div>
          )}

          <div className="ll-card"><div className="pad">
            <h3>Add a contact</h3>
            <div className="row" style={{ alignItems: "flex-end", marginTop: 8 }}>
              <div style={{ flex: "1 1 220px" }}>
                <label className="fld">From your contact book</label>
                <select className="select" value={pickId} onChange={(e) => setPickId(e.target.value)}>
                  <option value="">— choose —</option>
                  {book.map((c) => <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 190 }}>
                <label className="fld">Role on this property</label>
                <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="">—</option>
                  {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <button className="btn blue" disabled={!pickId} onClick={assign}>Add</button>
            </div>
            <div style={{ marginTop: 12 }}>
              {adding ? (
                <RecordForm
                  fields={[
                    { key: "name", label: "Name" },
                    { key: "role", label: "Role", type: "select", options: CONTACT_ROLES.map((r) => ({ value: r, label: r.replace(/_/g, " ") })) },
                    { key: "company", label: "Company" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" },
                    { key: "notes", label: "Notes", type: "textarea" },
                  ]}
                  record={{}} onSave={newContact} saving={saving} saveLabel="Create & add"
                  extraButtons={<button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>}
                />
              ) : (
                <button className="btn ghost" onClick={() => setAdding(true)}>+ New contact</button>
              )}
            </div>
          </div></div>
        </>
      )}
    </div>
  );
}

/* ------------------------------- main view ------------------------------- */
const TABS = [
  "Overview", "Entity / LLC", "Purchase", "Loan", "Leases & tenants",
  "Insurance", "Property tax", "Registrations", "Units", "Ownership", "Contacts", "Documents",
];

export default function LandlordPropertyDetail({ propertyId, membership, notify, onBack }) {
  const accountId = membership.account_id;
  const [prop, setProp] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [saving, setSaving] = useState(false);

  async function load() {
    try { setProp(await getProperty(propertyId)); }
    catch (e) { notify(e.message || "Could not load property"); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [propertyId]);

  async function saveProp(draft) {
    setSaving(true);
    try { await updateProperty(propertyId, draft); notify("Saved"); load(); }
    catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function removeProperty() {
    if (!confirm("Delete this property and all of its records? This cannot be undone.")) return;
    try { await deleteProperty(propertyId); notify("Property deleted"); onBack(); }
    catch (e) { notify(e.message || "Delete failed"); }
  }

  if (!prop) return <div className="ll-content"><div className="hint">Loading…</div></div>;

  return (
    <div className="ll-content">
      <button className="back-link" onClick={onBack}>← Back to properties</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: "var(--nv)" }}>{prop.label || prop.full_address || "Property"}</h2>
          {prop.full_address && prop.label && <div className="hint">{prop.full_address}</div>}
        </div>
        <span className={"badge " + (prop.status === "active" ? "owner" : prop.status === "sold" ? "member" : "pending")}>{prop.status}</span>
      </div>

      <div className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === "Overview" && (
        <div className="ll-card"><div className="pad">
          <RecordForm fields={OVERVIEW} record={prop} onSave={saveProp} saving={saving}
            extraButtons={<button className="btn danger" onClick={removeProperty}>Delete property</button>} />
        </div></div>
      )}
      {tab === "Entity / LLC" && <EntityTab property={prop} accountId={accountId} notify={notify} onLinked={load} />}
      {tab === "Purchase" && (
        <div className="ll-card"><div className="pad">
          <RecordForm fields={PURCHASE} record={prop} onSave={saveProp} saving={saving} />
        </div></div>
      )}
      {tab === "Loan" && <div className="ll-card"><div className="pad"><SingleTab api={loans} propertyId={propertyId} accountId={accountId} fields={LOAN} notify={notify} /></div></div>}
      {tab === "Leases & tenants" && <LeasesTab propertyId={propertyId} accountId={accountId} notify={notify} />}
      {tab === "Insurance" && <div className="ll-card"><div className="pad"><SingleTab api={insurance} propertyId={propertyId} accountId={accountId} fields={INSURANCE} notify={notify} /></div></div>}
      {tab === "Property tax" && <div className="ll-card"><div className="pad"><SingleTab api={propertyTax} propertyId={propertyId} accountId={accountId} fields={TAX} notify={notify} /></div></div>}
      {tab === "Registrations" && <ListTab api={registrations} propertyId={propertyId} accountId={accountId} fields={REG} notify={notify}
        summary={(r) => <><b style={{ textTransform: "capitalize" }}>{(r.type || "registration").replace(/_/g, " ")}</b><span className="hint"> · {r.number || "—"}{r.expiration_date ? " · exp " + fmtDate(r.expiration_date) : ""}</span></>} />}
      {tab === "Units" && <ListTab api={units} propertyId={propertyId} accountId={accountId} fields={UNIT} notify={notify}
        summary={(r) => <><b>{r.label || "Unit"}</b><span className="hint"> · {r.beds ?? "?"}bd/{r.baths ?? "?"}ba{r.market_rent ? " · " + money(r.market_rent) : ""} · {r.status}</span></>} />}
      {tab === "Ownership" && <ListTab api={splits} propertyId={propertyId} accountId={accountId} fields={SPLIT} notify={notify}
        summary={(r) => <><b>{r.partner_name}</b><span className="hint"> · {r.pct_after ?? r.pct_prior ?? "?"}%{r.is_iska ? " · iska" : ""}</span></>} />}
      {tab === "Contacts" && <ContactsTab propertyId={propertyId} accountId={accountId} notify={notify} />}
      {tab === "Documents" && (
        <div className="ll-card"><div className="pad empty">
          <div className="big">Document vault</div>
          <div className="hint">Uploads arrive in the next build. Closing documents and the title policy will land here automatically from your Lakeland closing.</div>
        </div></div>
      )}
    </div>
  );
}
