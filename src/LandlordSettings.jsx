import React, { useState } from "react";
import { updateAccount, changePassword } from "./landlordDb.js";

export default function LandlordSettings({ membership, notify, onAccountRenamed }) {
  const isOwner = membership.role === "owner";
  const [name, setName] = useState(membership.account?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  async function saveName() {
    if (!name.trim()) { notify("Name can't be empty"); return; }
    setSavingName(true);
    try { await updateAccount(membership.account_id, { name: name.trim() }); notify("Account name updated"); onAccountRenamed && onAccountRenamed(); }
    catch (e) { notify(e.message || "Could not update"); }
    finally { setSavingName(false); }
  }
  async function savePw() {
    if (pw.length < 8) { notify("Use at least 8 characters"); return; }
    if (pw !== confirm) { notify("Passwords don't match"); return; }
    setSavingPw(true);
    try { await changePassword(pw); setPw(""); setConfirm(""); notify("Password updated"); }
    catch (e) { notify(e.message || "Could not update password"); }
    finally { setSavingPw(false); }
  }

  return (
    <div className="ll-content" style={{ maxWidth: 640 }}>
      <div className="ll-card" style={{ marginBottom: 18 }}><div className="pad">
        <h3>Account</h3>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div>
            <label className="fld">Company ID</label>
            <input className="input" value={membership.account?.company_code || "—"} readOnly style={{ background: "#f5f7fa" }} />
          </div>
          <div>
            <label className="fld">Your User ID</label>
            <input className="input" value={membership.username || "—"} readOnly style={{ background: "#f5f7fa" }} />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="fld">Account name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!isOwner} />
          {isOwner
            ? <button className="btn blue" style={{ marginTop: 10 }} disabled={savingName} onClick={saveName}>{savingName ? "Saving…" : "Save name"}</button>
            : <div className="hint" style={{ marginTop: 6 }}>Only the account owner can rename the account.</div>}
        </div>
      </div></div>

      <div className="ll-card"><div className="pad">
        <h3>Change your password</h3>
        <div className="form-grid" style={{ marginTop: 8 }}>
          <div><label className="fld">New password</label><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
          <div><label className="fld">Confirm password</label><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        </div>
        <button className="btn blue" style={{ marginTop: 12 }} disabled={savingPw} onClick={savePw}>{savingPw ? "Saving…" : "Update password"}</button>
      </div></div>
    </div>
  );
}
