import React, { useEffect, useState } from "react";
import { listProperties, createProperty, mergeTitleImport, dismissReview } from "./landlordProps.js";
import { RecordForm } from "./landlordForm.jsx";
import LandlordPropertyDetail from "./LandlordPropertyDetail.jsx";

const TYPE_OPTIONS = [
  { value: "sfr", label: "Single family" },
  { value: "multi", label: "Multi-family" },
  { value: "condo", label: "Condo" },
  { value: "mixed", label: "Mixed use" },
  { value: "land", label: "Land" },
];
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "prospect", label: "Prospect" },
  { value: "sold", label: "Sold" },
];

const ADD_FIELDS = [
  { key: "label", label: "Name / nickname", placeholder: "e.g. 12 Oak St" },
  { key: "full_address", label: "Full address", full: true },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP" },
  { key: "county", label: "County" },
  { key: "property_type", label: "Type", type: "select", options: TYPE_OPTIONS },
  { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
];

function money(n) {
  if (n === null || n === undefined || n === "") return null;
  return "$" + Number(n).toLocaleString();
}

export default function LandlordProperties({ membership, notify }) {
  const accountId = membership.account_id;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function reload() {
    setLoading(true);
    try { setRows(await listProperties(accountId)); }
    catch (e) { notify(e.message || "Could not load properties"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [accountId]);

  async function add(draft) {
    if (!draft.label && !draft.full_address) { notify("Give the property a name or address"); return; }
    setSaving(true);
    try {
      const p = await createProperty({ account_id: accountId, status: "active", ...draft });
      setAdding(false);
      await reload();
      setOpenId(p.id);
    } catch (e) { notify(e.message || "Could not create property"); }
    finally { setSaving(false); }
  }

  async function mergeOne(p) {
    try { await mergeTitleImport(p); notify("Merged into your existing property"); reload(); }
    catch (e) { notify(e.message || "Could not merge"); }
  }
  async function keepSeparate(p) {
    try { await dismissReview(p.id); notify("Kept as a separate property"); reload(); }
    catch (e) { notify(e.message || "Could not update"); }
  }

  const pending = rows.filter((p) => p.review_status === "pending");
  const normal = rows.filter((p) => p.review_status !== "pending");
  const nameOf = (id) => { const m = rows.find((r) => r.id === id); return m ? (m.label || m.full_address || "your property") : "your property"; };

  if (openId) {
    return (
      <LandlordPropertyDetail
        propertyId={openId}
        membership={membership}
        notify={notify}
        onBack={() => { setOpenId(null); reload(); }}
      />
    );
  }

  return (
    <div className="ll-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div className="hint">{normal.length} {normal.length === 1 ? "property" : "properties"}</div>
        <button className="btn blue" onClick={() => setAdding(true)}>+ Add property</button>
      </div>

      {pending.map((p) => (
        <div key={p.id} className="ll-card" style={{ marginBottom: 12, borderLeft: "4px solid var(--warn)" }}>
          <div className="pad">
            <div style={{ fontWeight: 700, color: "var(--nv)" }}>Imported from your Lakeland closing</div>
            <div style={{ margin: "4px 0 10px" }}>
              <b>{p.full_address || p.label}</b> looks like it matches a property you already have
              {p.matched_property_id ? <> — <b>{nameOf(p.matched_property_id)}</b></> : ""}. Merge them, or keep this as a separate property?
            </div>
            <div className="row">
              <button className="btn blue" onClick={() => mergeOne(p)}>Merge into existing</button>
              <button className="btn ghost" onClick={() => keepSeparate(p)}>Keep separate</button>
            </div>
          </div>
        </div>
      ))}

      {loading ? (
        <div className="ll-card"><div className="pad hint">Loading…</div></div>
      ) : normal.length === 0 && pending.length === 0 ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">No properties yet</div>
          <div className="hint">Add your first property, or one will appear automatically when a Lakeland closing funds.</div>
          <button className="btn blue" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>+ Add property</button>
        </div></div>
      ) : (
        <div className="ll-grid cols">
          {normal.map((p) => (
            <button key={p.id} className="ll-card prop-card" onClick={() => setOpenId(p.id)}>
              <div className="pad">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <h3>{p.label || p.full_address || "Untitled property"}</h3>
                  <span className={"badge " + (p.status === "active" ? "owner" : p.status === "sold" ? "member" : "pending")}>{p.status}</span>
                </div>
                {p.full_address && p.label && <div className="hint">{p.full_address}</div>}
                <div className="hint" style={{ marginTop: 8 }}>
                  {p.entity?.name ? p.entity.name : "No entity"}
                  {money(p.purchase_price) ? " · " + money(p.purchase_price) : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {adding && (
        <div className="modal-bg" onClick={() => !saving && setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="mh"><b>Add property</b><button className="btn ghost sm" onClick={() => setAdding(false)}>Close</button></div>
            <div className="mb">
              <RecordForm fields={ADD_FIELDS} record={{ status: "active" }} onSave={add} saving={saving} saveLabel="Create property" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
