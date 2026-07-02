import { landlordDb as sb } from "./landlordDb.js";

const ok = ({ data, error }) => { if (error) throw error; return data; };
const okVoid = ({ error }) => { if (error) throw error; };

export const ITERATIONS = 250000;
const VERIFIER_TEXT = "landlord-vault-verify-v1";

/* ------------------------------ crypto ------------------------------ */
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export function randomSalt() {
  return bufToB64(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(b64ToBuf(saltB64)), iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encrypt(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return { ct: bufToB64(ct), iv: bufToB64(iv.buffer) };
}

export async function decrypt(key, ctB64, ivB64) {
  const dec = new TextDecoder();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(b64ToBuf(ivB64)) }, key, b64ToBuf(ctB64));
  return dec.decode(pt);
}

// Build the verifier at setup time.
export async function makeVerifier(key) {
  return encrypt(key, VERIFIER_TEXT);
}
// Confirm a derived key matches the stored verifier (i.e. correct passphrase).
export async function checkVerifier(key, ct, iv) {
  try { return (await decrypt(key, ct, iv)) === VERIFIER_TEXT; }
  catch { return false; }
}

/* ---------------------------- data layer ---------------------------- */
export async function getVaultConfig(accountId) {
  const { data, error } = await sb.from("landlord_vault_config").select("*").eq("account_id", accountId).maybeSingle();
  if (error) throw error;
  return data; // null if not set up
}

export async function createVaultConfig(accountId, { salt, verifier_ct, verifier_iv, iterations }) {
  return sb.from("landlord_vault_config")
    .insert({ account_id: accountId, salt, verifier_ct, verifier_iv, iterations })
    .select().single().then(ok);
}

export async function listCredentials(accountId) {
  return sb.from("landlord_credentials")
    .select("*, property:landlord_properties(id,label,full_address)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .then(ok);
}
export const createCredential = (obj) => sb.from("landlord_credentials").insert(obj).select().single().then(ok);
export const updateCredential = (id, patch) => sb.from("landlord_credentials").update(patch).eq("id", id).select().single().then(ok);
export const removeCredential = (id) => sb.from("landlord_credentials").delete().eq("id", id).then(okVoid);
