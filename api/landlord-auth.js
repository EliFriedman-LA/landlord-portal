// Vercel Serverless Function — credential login for the Landlord Portal.
// File location in the LANDLORD repo: api/landlord-auth.js
//
// Resolves Company ID + User ID -> the underlying Supabase auth email (server
// side, so the email is never exposed to the browser), then does a password
// grant and returns the session for the client to adopt.
//
// Env vars in the LANDLORD Vercel project:
//   SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_KEY

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const ANON_KEY     = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

const svc = () => ({ apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" });
const rest = (p) => `${SUPABASE_URL}/rest/v1/${p}`;
const enc = (v) => encodeURIComponent(v);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) return res.status(500).json({ ok: false, error: "Server not configured (missing Supabase env vars)." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  const company = String(body.company_code || "").trim();
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const GENERIC = "Invalid Company ID, User ID, or password.";
  if (!company || !username || !password) return res.status(400).json({ ok: false, error: "Enter your Company ID, User ID, and password." });

  try {
    // company_code -> account
    const ar = await fetch(rest(`landlord_accounts?company_code=ilike.${enc(company)}&select=id&limit=1`), { headers: svc() });
    const accts = ar.ok ? await ar.json() : [];
    const account = Array.isArray(accts) && accts[0] ? accts[0] : null;
    if (!account) return res.status(401).json({ ok: false, error: GENERIC });

    // (account, username) -> auth_email
    const mr = await fetch(rest(`landlord_members?account_id=eq.${account.id}&username=ilike.${enc(username)}&select=auth_email,must_change_password&limit=1`), { headers: svc() });
    const mems = mr.ok ? await mr.json() : [];
    const member = Array.isArray(mems) && mems[0] ? mems[0] : null;
    if (!member || !member.auth_email) return res.status(401).json({ ok: false, error: GENERIC });

    // password grant
    const tr = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email: member.auth_email, password }),
    });
    const tok = await tr.json();
    if (!tr.ok || !tok.access_token) return res.status(401).json({ ok: false, error: GENERIC });

    return res.status(200).json({
      ok: true,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      must_change_password: !!member.must_change_password,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
