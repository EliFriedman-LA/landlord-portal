import React, { useEffect, useMemo, useState } from "react";
import { listAllDocs, signedUrl, removeDoc, formatSize, DOC_CATEGORIES } from "./landlordDocs.js";

const propName = (p) => (p ? p.label || p.full_address || "Property" : "Unassigned");

export default function LandlordDocuments({ membership, notify }) {
  const accountId = membership.account_id;
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [prop, setProp] = useState("");

  async function reload() {
    setLoading(true);
    try { setDocs(await listAllDocs(accountId)); }
    catch (e) { notify(e.message || "Could not load documents"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [accountId]);

  const properties = useMemo(() => {
    const seen = new Map();
    docs.forEach((d) => { if (d.property?.id) seen.set(d.property.id, propName(d.property)); });
    return [...seen.entries()].map(([id, name]) => ({ id, name }));
  }, [docs]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return docs.filter((d) => {
      if (cat && d.category !== cat) return false;
      if (prop && d.property?.id !== prop) return false;
      if (needle && !(d.name || "").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [docs, q, cat, prop]);

  async function open(d) {
    try { const url = await signedUrl(d.storage_path); window.open(url, "_blank", "noopener"); }
    catch (e) { notify(e.message || "Could not open"); }
  }
  async function del(d) {
    if (!confirm(`Delete "${d.name}"?`)) return;
    try { await removeDoc(d); notify("Deleted"); reload(); }
    catch (e) { notify(e.message || "Delete failed"); }
  }

  return (
    <div className="ll-content">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap" }}>
        <div className="hint">{shown.length} of {docs.length} {docs.length === 1 ? "document" : "documents"}</div>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ minWidth: 200 }}><label className="fld">Search</label><input className="input" placeholder="File name…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ minWidth: 160 }}>
            <label className="fld">Category</label>
            <select className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All categories</option>
              {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 170 }}>
            <label className="fld">Property</label>
            <select className="select" value={prop} onChange={(e) => setProp(e.target.value)}>
              <option value="">All properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {loading ? <div className="hint">Loading…</div> : shown.length === 0 ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">{docs.length === 0 ? "No documents yet" : "No matches"}</div>
          <div className="hint">{docs.length === 0 ? "Upload documents from any property, or they'll arrive automatically from your Lakeland closings." : "Try a different search or filter."}</div>
        </div></div>
      ) : (
        <div className="ll-card"><div className="pad" style={{ padding: 0 }}>
          <table className="ll-table">
            <thead><tr><th>Document</th><th>Property</th><th>Category</th><th>Size</th><th>Added</th><th></th></tr></thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button className="linklike" style={{ textAlign: "left", width: "auto" }} onClick={() => open(d)}>{d.name}</button>
                    {d.source === "title_import" && <span className="badge member" style={{ marginLeft: 8 }}>from closing</span>}
                  </td>
                  <td className="hint">{propName(d.property)}</td>
                  <td className="hint">{d.category || "—"}</td>
                  <td className="hint">{formatSize(d.size_bytes)}</td>
                  <td className="hint">{new Date(d.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button className="btn ghost sm" onClick={() => open(d)}>Open</button>{" "}
                    <button className="btn danger sm" onClick={() => del(d)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </div>
  );
}
