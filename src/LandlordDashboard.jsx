import React from "react";

export default function LandlordDashboard({ membership, nav, onOpen }) {
  const acct = membership.account?.name || "Your account";
  const modules = nav.filter((n) => !["dashboard", "team", "settings"].includes(n.key));

  return (
    <div className="ll-content">
      <div className="ll-card" style={{ marginBottom: 18 }}>
        <div className="pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 2 }}>{acct}</h3>
            <div className="hint">
              {membership.role === "owner"
                ? "You have full access to this account."
                : "You have access to the areas below."}
            </div>
          </div>
          <div className="row">
            <Stat label="Properties" value="—" />
            <Stat label="Active leases" value="—" />
            <Stat label="Open tasks" value="—" />
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
              <div className="pad">
                <h3>{m.label}</h3>
                <div className="hint">Setting up — available in the next build.</div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="note" style={{ marginTop: 20 }}>
        The foundation is live. Properties, ledgers, the vault and the rest fill in over the next builds — everything you can see here is already permission-gated to you.
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center", minWidth: 84 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--nv)" }}>{value}</div>
      <div className="hint">{label}</div>
    </div>
  );
}
