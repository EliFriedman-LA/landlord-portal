import React, { useEffect, useState } from "react";
import {
  getVaultConfig, createVaultConfig, listCredentials, createCredential, updateCredential, removeCredential,
  deriveKey, encrypt, decrypt, makeVerifier, checkVerifier, randomSalt, ITERATIONS,
} from "./landlordVault.js";
import { listProperties } from "./landlordProps.js";

const propName = (p) => (p ? p.label || p.full_address || "Property" : "");

/* --------------------------------- setup --------------------------------- */
function VaultSetup({ accountId, notify, onReady }) {
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (pass.length < 8) { notify("Use at least 8 characters"); return; }
    if (pass !== confirm) { notify("Passphrases don't match"); return; }
    if (!ack) { notify("Please confirm you understand the passphrase can't be recovered"); return; }
    setBusy(true);
    try {
      const salt = randomSalt();
      const key = await deriveKey(pass, salt, ITERATIONS);
      const v = await makeVerifier(key);
      await createVaultConfig(accountId, { salt, verifier_ct: v.ct, verifier_iv: v.iv, iterations: ITERATIONS });
      onReady(key);
      notify("Vault created");
    } catch (e) { notify(e.message || "Could not create vault"); }
    finally { setBusy(false); }
  }

  return (
    <div className="ll-content" style={{ maxWidth: 620 }}>
      <div className="ll-card"><div className="pad">
        <h3>Set up your credential vault</h3>
        <p className="hint" style={{ marginBottom: 16 }}>
          Choose a master passphrase. It encrypts every password you store, right here in your browser.
          It is never sent to Lakeland or saved anywhere — which means only you can unlock this vault.
        </p>

        <div className="vault-warn">
          <b>Write this passphrase down and keep it safe.</b> There is no reset and no recovery.
          If you forget it, the passwords in this vault can never be decrypted — not by you, and not by Lakeland.
        </div>

        <div style={{ marginTop: 16 }}>
          <label className="fld">Master passphrase</label>
          <input className="input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label className="fld">Confirm passphrase</label>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()} />
        </div>

        <label className="chk" style={{ marginTop: 16 }}>
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          I understand that if I lose this passphrase, my stored passwords cannot be recovered.
        </label>

        <button className="btn blue" style={{ marginTop: 18 }} disabled={busy} onClick={create}>
          {busy ? "Creating…" : "Create vault"}
        </button>
      </div></div>
    </div>
  );
}

/* -------------------------------- unlock --------------------------------- */
function VaultUnlock({ config, notify, onUnlock }) {
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock() {
    if (!pass) return;
    setBusy(true);
    try {
      const key = await deriveKey(pass, config.salt, config.iterations || ITERATIONS);
      const good = await checkVerifier(key, config.verifier_ct, config.verifier_iv);
      if (!good) { notify("Wrong passphrase"); setBusy(false); return; }
      onUnlock(key);
    } catch (e) { notify(e.message || "Could not unlock"); setBusy(false); }
  }

  return (
    <div className="ll-content" style={{ maxWidth: 480 }}>
      <div className="ll-card"><div className="pad">
        <h3>Unlock your vault</h3>
        <p className="hint" style={{ marginBottom: 14 }}>Enter your master passphrase to decrypt your stored logins for this session.</p>
        <label className="fld">Master passphrase</label>
        <input className="input" type="password" autoComplete="current-password" value={pass}
          onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} autoFocus />
        <button className="btn blue" style={{ marginTop: 16 }} disabled={busy} onClick={unlock}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </div></div>
    </div>
  );
}

/* ------------------------------ credential row --------------------------- */
function CredRow({ cred, cryptoKey, notify, properties, onSaved, onDeleted }) {
  const [revealed, setRevealed] = useState("");
  const [showing, setShowing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: cred.label, portal_url: cred.portal_url || "", username: cred.username || "", property_id: cred.property_id || "", notes: cred.notes || "", password: "" });

  async function reveal() {
    if (showing) { setShowing(false); setRevealed(""); return; }
    if (!cred.secret_ciphertext) { notify("No password stored"); return; }
    try { setRevealed(await decrypt(cryptoKey, cred.secret_ciphertext, cred.secret_iv)); setShowing(true); }
    catch { notify("Could not decrypt — is this vault unlocked with the right passphrase?"); }
  }
  async function copy() {
    try {
      const pw = cred.secret_ciphertext ? await decrypt(cryptoKey, cred.secret_ciphertext, cred.secret_iv) : "";
      await navigator.clipboard.writeText(pw);
      notify("Password copied");
    } catch { notify("Copy failed"); }
  }
  async function save() {
    setSaving(true);
    try {
      const patch = {
        label: form.label, portal_url: form.portal_url || null, username: form.username || null,
        property_id: form.property_id || null, notes: form.notes || null,
      };
      if (form.password) {
        const enc = await encrypt(cryptoKey, form.password);
        patch.secret_ciphertext = enc.ct; patch.secret_iv = enc.iv; patch.key_model = "user";
      }
      await updateCredential(cred.id, patch);
      setEditing(false); notify("Saved"); onSaved();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }
  async function del() {
    if (!confirm(`Delete the login for "${cred.label}"?`)) return;
    try { await removeCredential(cred.id); notify("Deleted"); onDeleted(); } catch (e) { notify(e.message || "Delete failed"); }
  }

  return (
    <div className="ll-card" style={{ marginBottom: 10 }}>
      <div className="pad">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <b>{cred.label}</b>
            {cred.property?.id && <span className="hint"> · {propName(cred.property)}</span>}
            <div className="hint" style={{ marginTop: 2 }}>
              {cred.username ? "User: " + cred.username : "No username"}
              {cred.portal_url ? <> · <a href={cred.portal_url} target="_blank" rel="noopener noreferrer">open portal</a></> : ""}
            </div>
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <code className="secret">{showing ? revealed : "••••••••••"}</code>
              <button className="btn ghost sm" onClick={reveal}>{showing ? "Hide" : "Reveal"}</button>
              <button className="btn ghost sm" onClick={copy}>Copy</button>
            </div>
            {cred.notes && <div className="hint" style={{ marginTop: 8 }}>{cred.notes}</div>}
          </div>
          <div style={{ whiteSpace: "nowrap" }}>
            <button className="btn ghost sm" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Edit"}</button>{" "}
            <button className="btn danger sm" onClick={del}>Delete</button>
          </div>
        </div>

        {editing && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="form-grid">
              <div><label className="fld">Label</label><input className="input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div><label className="fld">Portal URL</label><input className="input" value={form.portal_url} onChange={(e) => setForm({ ...form, portal_url: e.target.value })} /></div>
              <div><label className="fld">Username</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div>
                <label className="fld">Property (optional)</label>
                <select className="select" value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
                  <option value="">— none —</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
                </select>
              </div>
              <div><label className="fld">New password (leave blank to keep)</label><input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="full"><label className="fld">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <button className="btn blue" style={{ marginTop: 12 }} disabled={saving} onClick={save}>{saving ? "Saving…" : "Save"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- vault --------------------------------- */
function VaultOpen({ accountId, cryptoKey, notify, onLock }) {
  const [creds, setCreds] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ label: "", portal_url: "", username: "", password: "", property_id: "", notes: "" });

  async function refresh() {
    setLoading(true);
    try {
      const [cs, ps] = await Promise.all([listCredentials(accountId), listProperties(accountId)]);
      setCreds(cs); setProperties(ps);
    } catch (e) { notify(e.message || "Load failed"); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, [accountId]);

  async function add() {
    if (!form.label.trim()) { notify("Give it a label"); return; }
    setSaving(true);
    try {
      const row = {
        account_id: accountId, property_id: form.property_id || null, label: form.label.trim(),
        portal_url: form.portal_url || null, username: form.username || null, notes: form.notes || null,
        key_model: "user",
      };
      if (form.password) {
        const enc = await encrypt(cryptoKey, form.password);
        row.secret_ciphertext = enc.ct; row.secret_iv = enc.iv;
      }
      await createCredential(row);
      setForm({ label: "", portal_url: "", username: "", password: "", property_id: "", notes: "" });
      setAdding(false); notify("Login saved"); refresh();
    } catch (e) { notify(e.message || "Save failed"); }
    finally { setSaving(false); }
  }

  return (
    <div className="ll-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div className="hint">Unlocked · {creds.length} {creds.length === 1 ? "login" : "logins"}</div>
        <div>
          {!adding && <button className="btn blue" onClick={() => setAdding(true)}>+ Add login</button>}{" "}
          <button className="btn ghost" onClick={onLock}>Lock vault</button>
        </div>
      </div>

      {adding && (
        <div className="ll-card" style={{ marginBottom: 16 }}><div className="pad">
          <h3>Add a login</h3>
          <div className="form-grid" style={{ marginTop: 8 }}>
            <div><label className="fld">Label</label><input className="input" placeholder="e.g. Loan portal" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
            <div><label className="fld">Portal URL</label><input className="input" placeholder="https://…" value={form.portal_url} onChange={(e) => setForm({ ...form, portal_url: e.target.value })} /></div>
            <div><label className="fld">Username</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
            <div><label className="fld">Password</label><input className="input" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            <div>
              <label className="fld">Property (optional)</label>
              <select className="select" value={form.property_id} onChange={(e) => setForm({ ...form, property_id: e.target.value })}>
                <option value="">— none —</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{propName(p)}</option>)}
              </select>
            </div>
            <div className="full"><label className="fld">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn blue" disabled={saving} onClick={add}>{saving ? "Saving…" : "Save login"}</button>
            <button className="btn ghost" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div></div>
      )}

      {loading ? <div className="hint">Loading…</div> : creds.length === 0 && !adding ? (
        <div className="ll-card"><div className="pad empty">
          <div className="big">No logins yet</div>
          <div className="hint">Add your loan, bank, tax, utility and insurance portal logins — all encrypted with your passphrase.</div>
        </div></div>
      ) : (
        creds.map((c) => (
          <CredRow key={c.id} cred={c} cryptoKey={cryptoKey} notify={notify} properties={properties}
            onSaved={refresh} onDeleted={refresh} />
        ))
      )}
    </div>
  );
}

/* --------------------------------- main ---------------------------------- */
export default function LandlordVault({ membership, notify }) {
  const accountId = membership.account_id;
  const [config, setConfig] = useState(undefined); // undefined loading | null none | object
  const [cryptoKey, setCryptoKey] = useState(null);

  async function loadConfig() {
    try { setConfig(await getVaultConfig(accountId)); }
    catch (e) { notify(e.message || "Could not load vault"); setConfig(null); }
  }
  useEffect(() => { setCryptoKey(null); loadConfig(); /* eslint-disable-next-line */ }, [accountId]);

  if (config === undefined) return <div className="ll-content"><div className="hint">Loading…</div></div>;
  if (config === null) return <VaultSetup accountId={accountId} notify={notify} onReady={(k) => { setCryptoKey(k); loadConfig(); }} />;
  if (!cryptoKey) return <VaultUnlock config={config} notify={notify} onUnlock={setCryptoKey} />;
  return <VaultOpen accountId={accountId} cryptoKey={cryptoKey} notify={notify} onLock={() => setCryptoKey(null)} />;
}
