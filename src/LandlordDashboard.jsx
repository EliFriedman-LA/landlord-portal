import React, { useEffect, useState } from "react";
import { getDashboardStats } from "./landlordProps.js";
import { getUpcoming } from "./landlordTasks.js";
import { ensureOccurrences, countOutstanding } from "./landlordMoney.js";

export default function LandlordDashboard({ membership, nav, onOpen }) {
  const accountId = membership.account_id;
  const acct = membership.account?.name || "Your account";
  const modules = nav.filter((n) => !["dashboard"].includes(n.key));
  const [stats, setStats] = useState(null);
  const [dueSoon, setDueSoon] = useState(null);
  const [toConfirm, setToConfirm] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getDashboardStats(accountId);
        if (!cancelled) setStats(s);
      } catch { if (!cancelled) setStats({ properties: 0, leases: 0, openTasks: 0 }); }
      try {
        const up = await getUpcoming(accountId);
        const today = new Date().toISOString().slice(0, 10);
        const soon = up.filter((i) => {
          const d = Math.round((new Date(i.date + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
          return d <= 30;
        }).length;
        if (!cancelled) setDueSoon(soon);
      } catch { if (!cancelled) setDueSoon(0); }
      try {
        await ensureOccurrences(accountId);
        const n = await countOutstanding(accountId);
        if (!cancelled) setToConfirm(n);
      } catch { if (!cancelled) setToConfirm(0); }
    })();
    return () => { cancelled = true; };
  }, [accountId]);

  const v = (n) => (n === null || n === undefined ? "—" : n);
  const canFinancials = !!nav.find((n) => n.key === "financials");

  return (
    <div className="ll-content">
      <div className="ll-card" style={{ marginBottom: 18 }}>
        <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 2 }}>{acct}</h3>
            <div className="hint">
              {membership.role === "owner" ? "You have full access to this account." : "You have access to the areas below."}
            </div>
          </div>
          <div className="row">
            <Stat label="Properties" value={v(stats?.properties)} onClick={() => onOpen("properties")} />
            <Stat label="Active leases" value={v(stats?.leases)} onClick={() => onOpen("properties")} />
            <Stat label="Open tasks" value={v(stats?.openTasks)} onClick={() => onOpen("tasks")} />
            <Stat label="Due in 30 days" value={v(dueSoon)} onClick={() => onOpen("tasks")} highlight={dueSoon > 0} />
            {canFinancials && (
              <Stat label="To confirm" value={v(toConfirm)} onClick={() => onOpen("financials")} highlight={toConfirm > 0} />
            )}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 2px 12px" }}>
        Your areas
      </div>

      {modules.length === 0 ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">No areas assigned yet</div>
          <div className="hint">Ask the account owner to grant you access.</div>
        </div></div>
      ) : (
        <div className="ll-grid cols">
          {modules.map((m) => (
            <button key={m.key} className="ll-card" style={{ textAlign: "left", cursor: "pointer", border: "1px solid var(--line)", background: "#fff" }} onClick={() => onOpen(m.key)}>
              <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>{m.label}</h3>
                <span className="hint">Open →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, onClick, highlight }) {
  return (
    <div onClick={onClick} style={{ textAlign: "center", minWidth: 88, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? "var(--warn)" : "var(--nv)" }}>{value}</div>
      <div className="hint">{label}</div>
    </div>
  );
}
