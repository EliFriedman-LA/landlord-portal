import React, { useEffect, useState } from "react";
import { listProperties, createProperty } from "./landlordProps.js";
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
        <div className="hint">{rows.length} {rows.length === 1 ? "property" : "properties"}</div>
        <button className="btn blue" onClick={() => setAdding(true)}>+ Add property</button>
      </div>

      {loading ? (
        <div className="ll-card"><div className="pad hint">Loading…</div></div>
      ) : rows.length === 0 ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">No properties yet</div>
          <div className="hint">Add your first property, or one will appear automatically when a Lakeland closing funds.</div>
          <button className="btn blue" style={{ marginTop: 14 }} onClick={() => setAdding(true)}>+ Add property</button>
        </div></div>
      ) : (
        <div className="ll-grid cols">
          {rows.map((p) => (
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
