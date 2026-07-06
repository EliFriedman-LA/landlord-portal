import React, { useEffect, useState } from "react";
import {
  SCOPES, listMembers, updateMember, removeMember,
  createTeamUser, resetTeamPassword,
} from "./landlordDb.js";

function PermToggles({ value, onChange, disabled }) {
  return (
    <div className="perm-grid">
      {SCOPES.map((s) => {
        const on = !!value[s.key];
        return (
          <div key={s.key} className={"perm" + (on ? " on" : "")}
            onClick={() => !disabled && onChange({ ...value, [s.key]: !on })}
            style={disabled ? { opacity: .55, cursor: "default" } : {}}>
            <div className="sw" />
            <div className="pl"><b>{s.label}</b><small>{s.hint}</small></div>
          </div>
        );
      })}
    </div>
  );
}

function CredsBox({ creds, onClose }) {
  if (!creds) return null;
  return (
    <div className="note" style={{ marginBottom: 16, background: "#eaf4fd", border: "1px solid #cfe6fb" }}>
      <b>Give these to {creds.username}:</b>
      <div style={{ marginTop: 6, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 13 }}>
        User ID: <b>{creds.username}</b><br />
        Temporary password: <b>{creds.temp_password}</b>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>They'll be asked to set their own password on first sign-in. This is the only time it's shown.</div>
      <button className="btn ghost sm" style={{ marginTop: 10 }} onClick={onClose}>Dismiss</button>
    </div>
  );
}

function MemberRow({ m, accountId, selfUserId, notify, reload, onCreds }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(m.role);
  const [perms, setPerms] = useState(m.permissions || {});
  const [busy, setBusy] = useState(false);
  const isSelf = m.user_id === selfUserId;
  const summary = m.role === "owner"
    ? "Full access"
    : SCOPES.filter((s) => m.permissions && m.permissions[s.key]).map((s) => s.label).join(", ") || "No areas";

  async function save() {
    setBusy(true);
    try {
      await updateMember(m.id, { role, permissions: role === "owner" ? {} : perms });
      notify("Access updated"); setOpen(false); reload();
    } catch (e) { notify(e.message || "Update failed"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Remove ${m.username || m.display_name || "this member"} from the account?`)) return;
    setBusy(true);
    try { await removeMember(m.id); notify("Member removed"); reload(); }
    catch (e) { notify(e.message || "Remove failed"); }
    finally { setBusy(false); }
  }
  async function resetPw() {
    setBusy(true);
    try { const d = await resetTeamPassword(accountId, m.id); onCreds(d); notify("Password reset"); }
    catch (e) { notify(e.message || "Reset failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600 }}>{m.display_name || m.username || "Member"}</div>
          {m.username && <div className="hint">User ID: {m.username}{isSelf ? " (you)" : ""}</div>}
        </td>
        <td><span className={"badge " + (m.role === "owner" ? "owner" : "member")}>{m.role}</span></td>
        <td className="hint" style={{ maxWidth: 320 }}>{summary}</td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <button className="btn ghost sm" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Edit access"}</button>
        </td>
      </tr>
      {open && (
        <tr><td colSpan={4} style={{ background: "#fafcff" }}>
          <div style={{ padding: "6px 2px 12px" }}>
            <div className="row" style={{ alignItems: "flex-end", marginBottom: 12 }}>
              <div style={{ minWidth: 180 }}>
                <label className="fld">Role</label>
                <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="member">Member — limited access</option>
                  <option value="owner">Owner — full access &amp; team control</option>
                </select>
              </div>
            </div>
            {role === "owner"
              ? <div className="note">Owners can see and edit everything, including the team.</div>
              : <PermToggles value={perms} onChange={setPerms} />}
            <div className="row" style={{ marginTop: 14 }}>
              <button className="btn blue sm" disabled={busy} onClick={save}>Save access</button>
              {!isSelf && <button className="btn ghost sm" disabled={busy} onClick={resetPw}>Reset password</button>}
              {!isSelf && <button className="btn danger sm" disabled={busy} onClick={remove}>Remove</button>}
            </div>
          </div>
        </td></tr>
      )}
    </>
  );
}

export default function LandlordTeam({ membership, notify, selfUserId }) {
  const accountId = membership.account_id;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creds, setCreds] = useState(null);

  // create-user form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("member");
  const [perms, setPerms] = useState({});
  const [creating, setCreating] = useState(false);

  async function reload() {
    setLoading(true);
    try { setMembers(await listMembers(accountId)); }
    catch (e) { notify(e.message || "Could not load the team"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [accountId]);

  async function createUser() {
    if (!username.trim()) { notify("Give them a User ID"); return; }
    setCreating(true);
    try {
      const d = await createTeamUser(accountId, {
        username: username.trim(), password: password.trim() || undefined,
        display_name: displayName.trim() || undefined, role, permissions: role === "owner" ? {} : perms,
      });
      setCreds(d);
      setUsername(""); setPassword(""); setDisplayName(""); setRole("member"); setPerms({});
      notify("Team member created");
      reload();
    } catch (e) { notify(e.message || "Could not create user"); }
    finally { setCreating(false); }
  }

  return (
    <div className="ll-content">
      <CredsBox creds={creds} onClose={() => setCreds(null)} />

      <div className="ll-card" style={{ marginBottom: 18 }}>
        <div className="pad">
          <h3>Team members</h3>
          <div className="hint" style={{ marginBottom: 12 }}>You control exactly what each teammate can see and do.</div>
          {loading ? <div className="hint">Loading…</div> : (
            <table className="ll-table">
              <thead><tr><th>Member</th><th>Role</th><th>Access</th><th></th></tr></thead>
              <tbody>
                {members.length === 0
                  ? <tr><td colSpan={4} className="hint">No members yet.</td></tr>
                  : members.map((m) => (
                    <MemberRow key={m.id} m={m} accountId={accountId} selfUserId={selfUserId} notify={notify} reload={reload} onCreds={setCreds} />
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="ll-card">
        <div className="pad">
          <h3>Add a team member</h3>
          <div className="hint" style={{ marginBottom: 14 }}>Create a User ID and a temporary password. Hand it to them — they'll set their own password on first sign-in. No email needed.</div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 180px" }}>
              <label className="fld">User ID</label>
              <input className="input" placeholder="e.g. jsmith" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label className="fld">Name (optional)</label>
              <input className="input" placeholder="Jane Smith" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 180px" }}>
              <label className="fld">Temp password (optional)</label>
              <input className="input" placeholder="auto-generated if blank" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div style={{ minWidth: 180 }}>
              <label className="fld">Role</label>
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Member — limited access</option>
                <option value="owner">Owner — full access</option>
              </select>
            </div>
          </div>
          {role === "member" && (
            <div style={{ marginTop: 14 }}>
              <label className="fld">What can they access?</label>
              <PermToggles value={perms} onChange={setPerms} />
            </div>
          )}
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn blue" disabled={creating} onClick={createUser}>{creating ? "Creating…" : "Create team member"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
