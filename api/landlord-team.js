// Vercel Serverless Function — team user management for the Landlord Portal.
// File location in the LANDLORD repo: api/landlord-team.js
//
// The account OWNER creates and resets their own team's User IDs + passwords.
// Gated on the owner's access token; all writes run with the service key.
//
// Actions (POST body { action, account_id, ... }, Authorization: Bearer <owner token>):
//   create-user   { username, password?, display_name?, role?, permissions? }
//   reset-password{ member_id, password? }
//
// Env vars in the LANDLORD Vercel project:
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const svc = (extra) => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", ...(extra || {}) });
const rest = (p) => `${SUPABASE_URL}/rest/v1/${p}`;
const enc = (v) => encodeURIComponent(v);
const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const randomPass = () => "La" + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89);

async function whoAmI(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? u : null;
}

async function requireOwner(uid, accountId) {
  const r = await fetch(rest(`landlord_members?account_id=eq.${accountId}&user_id=eq.${uid}&role=eq.owner&select=id&limit=1`), { headers: svc() });
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) && rows.length > 0;
}

async function getCompanyCode(accountId) {
  const r = await fetch(rest(`landlord_accounts?id=eq.${accountId}&select=company_code&limit=1`), { headers: svc() });
  const rows = r.ok ? await r.json() : [];
  return rows[0]?.company_code || null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return res.status(500).json({ ok: false, error: "Server not configured." });

  const me = await whoAmI(req);
  if (!me) return res.status(401).json({ ok: false, error: "Sign in required." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const accountId = body.account_id;
  if (!accountId) return res.status(400).json({ ok: false, error: "account_id required." });
  if (!(await requireOwner(me.id, accountId))) return res.status(403).json({ ok: false, error: "Only the account owner can manage team members." });

  try {
    if (body.action === "create-user") {
      const username = String(body.username || "").trim();
      if (!username || !/^[a-zA-Z0-9._-]{2,40}$/.test(username)) return res.status(400).json({ ok: false, error: "User ID must be 2–40 letters, numbers, dot, dash or underscore." });
      const role = body.role === "owner" ? "owner" : "member";
      const permissions = role === "owner" ? {} : (body.permissions || {});
      const password = String(body.password || "").trim() || randomPass();
      const code = await getCompanyCode(accountId);
      if (!code) return res.status(400).json({ ok: false, error: "Account has no Company ID." });
      const authEmail = `${slug(code)}.${slug(username)}@team.lakelandabstract.app`;

      // create the auth user
      const cr = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST", headers: svc(),
        body: JSON.stringify({ email: authEmail, password, email_confirm: true }),
      });
      const created = await cr.json();
      if (!cr.ok || !created.id) {
        const msg = (created && (created.msg || created.error_description || created.error)) || "could not create user";
        if (/already/i.test(msg) || cr.status === 422) return res.status(409).json({ ok: false, error: "That User ID is already taken in this company." });
        return res.status(500).json({ ok: false, error: msg });
      }

      const ins = await fetch(rest("landlord_members"), {
        method: "POST", headers: svc({ Prefer: "return=representation" }),
        body: JSON.stringify({ account_id: accountId, user_id: created.id, role, permissions, username, auth_email: authEmail, display_name: body.display_name || null, must_change_password: true }),
      });
      if (!ins.ok) return res.status(500).json({ ok: false, error: "member: " + (await ins.text()).substring(0, 200) });
      return res.status(200).json({ ok: true, username, temp_password: password });
    }

    if (body.action === "reset-password") {
      const memberId = body.member_id;
      if (!memberId) return res.status(400).json({ ok: false, error: "member_id required." });
      const mr = await fetch(rest(`landlord_members?id=eq.${enc(memberId)}&account_id=eq.${accountId}&select=id,user_id,username&limit=1`), { headers: svc() });
      const mems = mr.ok ? await mr.json() : [];
      const member = mems[0];
      if (!member) return res.status(404).json({ ok: false, error: "Member not found." });
      const password = String(body.password || "").trim() || randomPass();
      const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${member.user_id}`, { method: "PUT", headers: svc(), body: JSON.stringify({ password }) });
      if (!ur.ok) return res.status(500).json({ ok: false, error: "reset: " + (await ur.text()).substring(0, 200) });
      await fetch(rest(`landlord_members?id=eq.${enc(memberId)}`), { method: "PATCH", headers: svc({ Prefer: "return=minimal" }), body: JSON.stringify({ must_change_password: true }) });
      return res.status(200).json({ ok: true, username: member.username, temp_password: password });
    }

    return res.status(400).json({ ok: false, error: "Unknown action." });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
