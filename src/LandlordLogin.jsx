import React, { useState } from "react";
import { sendMagicLink } from "./landlordDb.js";

export default function LandlordLogin({ hasInvite }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const configured =
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;

  async function submit() {
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
            <div style={{ color: "#9fb4cc", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>
              Lakeland Abstract
            </div>
          </div>
        </div>

        {!configured && (
          <div className="note" style={{ marginBottom: 16 }}>
            Set <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_ANON_KEY</b> in Vercel to enable sign-in.
          </div>
        )}

        {hasInvite && !sent && (
          <div className="note" style={{ marginBottom: 16 }}>
            You have an invitation. Sign in with the email it was sent to and you will be added to the account automatically.
          </div>
        )}

        {sent ? (
          <div className="ok">
            Check your email. We sent a sign-in link to <b>{email}</b>. Open it on this device to continue.
          </div>
        ) : (
          <>
            <p className="sub">Enter your email and we will send you a secure sign-in link. No password to remember.</p>
            <label className="fld" htmlFor="em">Email</label>
            <input
              id="em"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            {err && <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>{err}</div>}
            <button className="btn blue" style={{ width: "100%", marginTop: 16 }} disabled={busy} onClick={submit}>
              {busy ? "Sending…" : "Send sign-in link"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
