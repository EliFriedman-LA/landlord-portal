import React, { useEffect, useState } from "react";
import {
  SCOPES, listMembers, listInvites, createInvite, revokeInvite,
  updateMember, removeMember, inviteLink,
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

function MemberRow({ m, selfUserId, notify, reload }) {
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
      notify("Access updated");
      setOpen(false);
      reload();
    } catch (e) { notify(e.message || "Update failed"); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm(`Remove ${m.email || "this member"} from the account?`)) return;
    setBusy(true);
    try { await removeMember(m.id); notify("Member removed"); reload(); }
    catch (e) { notify(e.message || "Remove failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <tr>
        <td>
          <div style={{ fontWeight: 600 }}>{m.display_name || m.email || "Member"}</div>
          {m.email && m.display_name && <div className="hint">{m.email}</div>}
          {isSelf && <span className="hint"> (you)</span>}
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
              {!isSelf && <button className="btn danger sm" disabled={busy} onClick={remove}>Remove from account</button>}
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
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  // invite form
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [perms, setPerms] = useState({});
  const [creating, setCreating] = useState(false);
  const [lastLink, setLastLink] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const [ms, inv] = await Promise.all([listMembers(accountId), listInvites(accountId)]);
      setMembers(ms); setInvites(inv);
    } catch (e) { notify(e.message || "Could not load the team"); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [accountId]);

  async function invite() {
    if (!email.trim()) return;
    setCreating(true);
    try {
      const res = await createInvite(accountId, { email, role, permissions: role === "owner" ? {} : perms });
      setLastLink(inviteLink(res.token));
      setEmail(""); setRole("member"); setPerms({});
      notify("Invitation created");
      reload();
    } catch (e) { notify(e.message || "Could not create invite"); }
    finally { setCreating(false); }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => notify("Link copied")).catch(() => notify("Copy failed"));
  }

  return (
    <div className="ll-content">
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
                    <MemberRow key={m.id} m={m} selfUserId={selfUserId} notify={notify} reload={reload} />
                  ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="ll-card" style={{ marginBottom: 18 }}>
        <div className="pad">
          <h3>Invite a teammate</h3>
          <div className="hint" style={{ marginBottom: 14 }}>They sign in with a secure link sent to this email, then land in this account with the access you set here.</div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 240px" }}>
              <label className="fld">Email</label>
              <input className="input" type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div style={{ minWidth: 190 }}>
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
            <button className="btn blue" disabled={creating} onClick={invite}>Create invitation</button>
          </div>
          {lastLink && (
            <div className="note" style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ wordBreak: "break-all" }}>{lastLink}</span>
              <button className="btn ghost sm" onClick={() => copy(lastLink)}>Copy link</button>
            </div>
          )}
        </div>
      </div>

      {invites.length > 0 && (
        <div className="ll-card">
          <div className="pad">
            <h3>Pending invitations</h3>
            <table className="ll-table">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
              <tbody>
                {invites.map((inv) => (
                  <tr key={inv.id}>
                    <td>{inv.email} <span className="badge pending" style={{ marginLeft: 6 }}>pending</span></td>
                    <td style={{ textTransform: "capitalize" }}>{inv.role}</td>
                    <td className="hint">{new Date(inv.expires_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn ghost sm" onClick={() => copy(inviteLink(inv.token || ""))} disabled={!inv.token}>Copy link</button>{" "}
                      <button className="btn danger sm" onClick={async () => { await revokeInvite(inv.id); notify("Invitation revoked"); reload(); }}>Revoke</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="hint" style={{ marginTop: 8 }}>Copy-link is available right after creating an invite. Existing pending links can be re-created if lost.</div>
          </div>
        </div>
      )}
    </div>
  );
}
