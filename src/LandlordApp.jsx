import React, { useEffect, useMemo, useState } from "react";
import {
  getSession, onAuthChange, signOut, loadMemberships, redeemInvite, can,
} from "./landlordDb.js";
import LandlordLogin from "./LandlordLogin.jsx";
import LandlordTeam from "./LandlordTeam.jsx";
import LandlordDashboard from "./LandlordDashboard.jsx";
import LandlordProperties from "./LandlordProperties.jsx";
import LandlordFinancials from "./LandlordFinancials.jsx";
import LandlordVault from "./LandlordVault.jsx";
import LandlordTasks from "./LandlordTasks.jsx";
import LandlordContacts from "./LandlordContacts.jsx";
import LandlordAcquisitions from "./LandlordAcquisitions.jsx";

// ---- tiny inline icon set (20x20, stroke) ----
const P = (d) => <path d={d} />;
function Icon({ name }) {
  const paths = {
    dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z",
    home: "M3 11l9-8 9 8M5 10v10h14V10",
    dollar: "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    receipt: "M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1zM8 8h8M8 12h8",
    doc: "M6 2h8l4 4v16H6zM14 2v4h4M9 13h6M9 17h6",
    lock: "M6 10V7a6 6 0 0 1 12 0v3M4 10h16v11H4z",
    users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M17 11a4 4 0 0 0 0-8M22 21v-1a6 6 0 0 0-4-5.6",
    check: "M4 12l5 5L20 6",
    target: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
    team: "M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 21v-2a4 4 0 0 1 4-4M18 17l1.5 1.5M20 15l-4 4",
    gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-4l-.3 2.9a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L4 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.9h4l.3-2.9a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6a7 7 0 0 0 .1-1z",
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="ic">
      {P(paths[name] || paths.dashboard)}
    </svg>
  );
}

const MODULES = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard", ready: true },
  { key: "properties", label: "Properties", icon: "home", scope: "properties" },
  { key: "financials", label: "Financials", icon: "dollar", scope: "financials" },
  { key: "bills", label: "Bills", icon: "receipt", scope: "financials" },
  { key: "documents", label: "Documents", icon: "doc", scope: "documents" },
  { key: "vault", label: "Credential vault", icon: "lock", scope: "vault" },
  { key: "contacts", label: "Contacts", icon: "users", scope: "contacts" },
  { key: "tasks", label: "Tasks", icon: "check", scope: "tasks" },
  { key: "deals", label: "Acquisitions", icon: "target", scope: "deals" },
];

function Placeholder({ label }) {
  return (
    <div className="ll-content">
      <div className="ll-card"><div className="pad empty">
        <div className="big">{label} is on the way</div>
        <div className="hint">This module arrives in the next build. The database and your permissions for it are already in place.</div>
      </div></div>
    </div>
  );
}

function Splash({ text }) {
  return <div className="ll-login"><div style={{ color: "#dfe8f2", fontSize: 15 }}>{text}</div></div>;
}

export default function LandlordApp() {
  const [session, setSession] = useState(undefined);   // undefined = still checking
  const [memberships, setMemberships] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loadingM, setLoadingM] = useState(false);
  const [view, setView] = useState("dashboard");
  const [sideOpen, setSideOpen] = useState(false);
  const [toast, setToast] = useState("");

  const inviteToken = useMemo(
    () => new URLSearchParams(window.location.search).get("invite"),
    []
  );

  useEffect(() => {
    let unsub = () => {};
    getSession().then((s) => setSession(s));
    unsub = onAuthChange((s) => setSession(s));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setMemberships([]); return; }
    let cancelled = false;
    (async () => {
      setLoadingM(true);
      try {
        if (inviteToken) {
          try { await redeemInvite(inviteToken); } catch (e) { /* already a member or invalid */ }
          const url = new URL(window.location.href);
          url.searchParams.delete("invite");
          window.history.replaceState({}, "", url.toString());
        }
        const ms = await loadMemberships();
        if (cancelled) return;
        setMemberships(ms);
        setActiveId((prev) => prev || (ms[0] && ms[0].account_id) || null);
      } finally {
        if (!cancelled) setLoadingM(false);
      }
    })();
    return () => { cancelled = true; };
  }, [session, inviteToken]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const active = memberships.find((m) => m.account_id === activeId) || memberships[0] || null;

  const nav = useMemo(() => {
    if (!active) return [];
    const items = MODULES.filter((m) => !m.scope || can(active, m.scope));
    if (active.role === "owner") {
      items.push({ key: "team", label: "Team & access", icon: "team", owner: true });
      items.push({ key: "settings", label: "Settings", icon: "gear", owner: true });
    }
    return items;
  }, [active]);

  // keep view valid for the active account's permissions
  useEffect(() => {
    if (active && !nav.find((n) => n.key === view)) setView("dashboard");
  }, [active, nav, view]);

  if (session === undefined) return <Splash text="Loading…" />;
  if (!session) return <LandlordLogin hasInvite={!!inviteToken} />;
  if (loadingM) return <Splash text="Setting up your workspace…" />;

  if (!active) {
    return (
      <div className="ll-login"><div className="box">
        <div className="logo"><img src="/icon-192.png" alt="" /><h2>Landlord Portal</h2></div>
        <div className="note">Your account isn't set up yet. Lakeland provisions access — reach out to <b>efriedman@lakelandabstract.com</b> and we'll get you connected.</div>
        <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => signOut()}>Sign out</button>
      </div></div>
    );
  }

  const current = nav.find((n) => n.key === view) || nav[0];

  return (
    <div className="ll-shell">
      <aside className={"ll-side" + (sideOpen ? " open" : "")}>
        <div className="ll-brand">
          <img src="/icon-192.png" alt="" />
          <div><span>Lakeland</span><b>Landlord Portal</b></div>
        </div>

        <div className="ll-acct">
          <small>Account</small>
          {memberships.length > 1 ? (
            <select value={active.account_id} onChange={(e) => { setActiveId(e.target.value); setView("dashboard"); }}>
              {memberships.map((m) => <option key={m.account_id} value={m.account_id}>{m.account?.name || "Account"}</option>)}
            </select>
          ) : (
            <div style={{ color: "#fff", fontWeight: 600 }}>{active.account?.name || "Account"}</div>
          )}
        </div>

        <nav className="ll-nav">
          {nav.map((n) => (
            <button key={n.key} className={view === n.key ? "active" : ""}
              onClick={() => { setView(n.key); setSideOpen(false); }}>
              <Icon name={n.icon} /> {n.label}
            </button>
          ))}
        </nav>

        <div className="ll-side-foot">
          <div style={{ color: "#9fb4cc", fontSize: 12, marginBottom: 4 }}>
            {session.user?.email} · <span style={{ textTransform: "capitalize" }}>{active.role}</span>
          </div>
          <button onClick={() => signOut()}>Sign out</button>
        </div>
      </aside>

      <div className="ll-main">
        <header className="ll-top">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button className="ll-menu-btn" onClick={() => setSideOpen((v) => !v)} aria-label="Menu">☰</button>
            <h1>{current?.label}</h1>
          </div>
        </header>

        {view === "dashboard" && <LandlordDashboard membership={active} nav={nav} onOpen={setView} />}
        {view === "properties" && <LandlordProperties membership={active} notify={setToast} />}
        {view === "financials" && <LandlordFinancials membership={active} notify={setToast} initialTab="Income" />}
        {view === "bills" && <LandlordFinancials membership={active} notify={setToast} initialTab="Bills" />}
        {view === "vault" && <LandlordVault membership={active} notify={setToast} />}
        {view === "tasks" && <LandlordTasks membership={active} notify={setToast} />}
        {view === "contacts" && <LandlordContacts membership={active} notify={setToast} />}
        {view === "deals" && <LandlordAcquisitions membership={active} notify={setToast} />}
        {view === "team" && <LandlordTeam membership={active} notify={setToast} selfUserId={session.user?.id} />}
        {view === "settings" && <Placeholder label="Settings" />}
        {current && !["dashboard", "properties", "financials", "bills", "vault", "tasks", "contacts", "deals", "team", "settings"].includes(view) && <Placeholder label={current.label} />}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
