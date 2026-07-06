import React, { useState } from "react";
import { sendMagicLink, signInWithCredentials } from "./landlordDb.js";

export default function LandlordLogin({ hasInvite }) {
  const [mode, setMode] = useState("credentials"); // "credentials" | "email"
  const [company, setCompany] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const configured = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;

  async function login() {
    setErr("");
    if (!company.trim() || !username.trim() || !password) { setErr("Enter your Company ID, User ID, and password."); return; }
    setBusy(true);
    try {
      await signInWithCredentials(company.trim(), username.trim(), password);
      // onAuthStateChange in LandlordApp takes over from here.
    } catch (e) {
      setErr(e.message || "Could not sign in.");
      setBusy(false);
    }
  }

  async function sendLink() {
    setErr("");
    if (!email.trim()) return;
    setBusy(true);
    try {
      const { error } = await sendMagicLink(email.trim());
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e.message || "Could not send the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ll-login">
      <div className="box">
        <div className="logo">
          <img src="/icon-192.png" alt="" />
          <div>
            <h2>Landlord Portal</h2>
            <div style={{ color: "#9fb4cc", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>Lakeland Abstract</div>
          </div>
        </div>

        {!configured && (
          <div className="note" style={{ marginBottom: 16 }}>
            Set <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> in Vercel to enable sign-in.
          </div>
        )}

        {hasInvite && (
          <div className="note" style={{ marginBottom: 16 }}>
            You have an invitation. Sign in with the email it was sent to and you'll be added automatically.
          </div>
        )}

        {mode === "credentials" ? (
          <>
            <p className="sub">Sign in with the Company ID and User ID from Lakeland.</p>
            <label className="fld" htmlFor="co">Company ID</label>
            <input id="co" className="input" autoCapitalize="characters" placeholder="e.g. LA7X4Q" value={company}
              onChange={(e) => setCompany(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
            <label className="fld" htmlFor="uid" style={{ marginTop: 12 }}>User ID</label>
            <input id="uid" className="input" autoCapitalize="none" placeholder="e.g. owner" value={username}
              onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
            <label className="fld" htmlFor="pw" style={{ marginTop: 12 }}>Password</label>
            <input id="pw" className="input" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
            {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button className="btn blue" style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={login}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <button className="linklike" style={{ marginTop: 14 }} onClick={() => { setMode("email"); setErr(""); }}>
              Account owner? Sign in with an email link instead
            </button>
          </>
        ) : sent ? (
          <div className="ok">Check your email. We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.</div>
        ) : (
          <>
            <p className="sub">For account owners: we'll email you a one-time sign-in link.</p>
            <label className="fld" htmlFor="em">Email</label>
            <input id="em" className="input" type="email" autoComplete="email" placeholder="you@company.com" value={email}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendLink()} />
            {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button className="btn blue" style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={sendLink}>
              {busy ? "Sending…" : "Send sign-in link"}
            </button>
            <button className="linklike" style={{ marginTop: 14 }} onClick={() => { setMode("credentials"); setErr(""); }}>
              Back to Company ID sign-in
            </button>
          </>
        )}
      </div>
    </div>
  );
}
