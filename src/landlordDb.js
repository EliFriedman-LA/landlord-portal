import { landlordClient as db } from "./landlordClient.js";

// ---------------------------------------------------------------------
// Permission scopes the owner can grant to teammates.
// ---------------------------------------------------------------------
export const SCOPES = [
  { key: "properties", label: "Properties", hint: "Properties, units, leases, insurance, taxes, registrations" },
  { key: "financials", label: "Financials", hint: "Income, expenses, bills, loans, acquisition funds" },
  { key: "vault", label: "Credential vault", hint: "Stored portal logins" },
  { key: "documents", label: "Documents", hint: "Property document vault" },
  { key: "contacts", label: "Contacts", hint: "Team, vendors, tenants" },
  { key: "tasks", label: "Tasks & reminders", hint: "To-dos and renewal alerts" },
  { key: "deals", label: "Acquisitions", hint: "Deal pipeline and checklist" },
];

// Owner sees everything; members see only scopes toggled true.
export function can(membership, scope) {
  if (!membership) return false;
  if (membership.role === "owner") return true;
  return !!(membership.permissions && membership.permissions[scope]);
}

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------
export async function getSession() {
  const { data } = await db.auth.getSession();
  return data.session || null;
}

export function onAuthChange(cb) {
  const { data } = db.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

export async function sendMagicLink(email) {
  return db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
}

export async function signOut() {
  return db.auth.signOut();
}

// ---------------------------------------------------------------------
// Membership — which account(s) the current user belongs to
// ---------------------------------------------------------------------
export async function loadMemberships() {
  const { data, error } = await db
    .from("landlord_members")
    .select("id, account_id, role, permissions, account:landlord_accounts(id, name, logo_path, status)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((m) => ({
    memberId: m.id,
    account_id: m.account_id,
    role: m.role,
    permissions: m.permissions || {},
    account: m.account,
  }));
}

// Redeem a team invite token (from the invite link).
export async function redeemInvite(token) {
  const { data, error } = await db.rpc("redeem_landlord_invite", { p_token: token });
  if (error) throw error;
  return data; // account_id
}

// ---------------------------------------------------------------------
// Team management (owner only — RLS enforces)
// ---------------------------------------------------------------------
export async function listMembers(accountId) {
  const { data, error } = await db
    .from("landlord_members")
    .select("id, user_id, email, display_name, role, permissions, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function listInvites(accountId) {
  const { data, error } = await db
    .from("landlord_invites")
    .select("id, email, role, permissions, token, accepted_at, expires_at, created_at")
    .eq("account_id", accountId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createInvite(accountId, { email, role, permissions }) {
  const { data, error } = await db
    .from("landlord_invites")
    .insert({ account_id: accountId, email: email.trim().toLowerCase(), role, permissions })
    .select("id, token, email")
    .single();
  if (error) throw error;
  return data;
}

export async function revokeInvite(inviteId) {
  const { error } = await db.from("landlord_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

export async function updateMember(memberId, patch) {
  const { error } = await db.from("landlord_members").update(patch).eq("id", memberId);
  if (error) throw error;
}

export async function removeMember(memberId) {
  const { error } = await db.from("landlord_members").delete().eq("id", memberId);
  if (error) throw error;
}

export async function updateAccount(accountId, patch) {
  const { error } = await db.from("landlord_accounts").update(patch).eq("id", accountId);
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Storage — every object MUST be prefixed with the account id.
// ---------------------------------------------------------------------
export function storagePath(accountId, ...parts) {
  return [accountId, ...parts.filter(Boolean)].join("/");
}

export function inviteLink(token) {
  return `${window.location.origin}/?invite=${token}`;
}

export { db as landlordDb };
