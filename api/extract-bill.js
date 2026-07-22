// =============================================================================
// Vercel Serverless Function — Landlord bill / expense parser (AI)
// Repo location: api/extract-bill.js  (Landlord Portal project)
// =============================================================================
// Reads a vendor bill / invoice / utility statement PDF and returns structured
// fields so a landlord can add it to the Bills ledger without re-typing:
//   { vendor_name, bill_date, due_date, total_amount, category, line_items[] }
//
// REQUIRED ENV VAR (Vercel -> Settings -> Environment Variables):
//   ANTHROPIC_API_KEY = sk-ant-...   (Production + Preview, then redeploy)
// INPUT : POST { pdfBase64, fileName? }   (base64 of a single, small bill PDF)
// OUTPUT: { ok, data: { vendor_name, bill_date, due_date, total_amount,
//                       category, line_items: [{ description, amount }] } }
// =============================================================================

export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-4-6";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You read a single vendor BILL, INVOICE, or utility/service STATEMENT addressed to a property owner. Extract the payable details.

OUTPUT: a SINGLE JSON object, no prose, no markdown, no code fences:
{
  "vendor_name": "",
  "bill_date": "",
  "due_date": "",
  "total_amount": null,
  "category": "",
  "line_items": [
    { "description": "", "amount": 0 }
  ]
}

RULES
- vendor_name: the company/person billing (the payee), else "".
- bill_date / due_date: MM/DD/YYYY if present, else "". due_date is the "pay by" / "due" date.
- total_amount: the AMOUNT DUE / balance / invoice total as a NUMBER only, no "$" or commas.
- category: a short lowercase guess of the expense type — one of: utilities, water, sewer, gas, electric, insurance, property tax, repairs, maintenance, management, hoa, legal, mortgage, supplies, other.
- line_items: one object per charge line with a description and its line amount (NUMBER only). If the bill is a single lump charge, output one line item that mirrors the total.
- Do NOT output subtotal / tax / balance-forward / "thank you" rows as line_items — those belong only in total_amount.
- Use ONLY what appears on the page. NEVER invent amounts, dates, or a vendor. Missing text = "" or null.`;

function safeParseJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  try { return JSON.parse(t); } catch { return null; }
}

function num(v) {
  if (v == null || v === "") return null;
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? null : n;
}

async function anthropic(apiKey, payload) {
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || JSON.stringify(data).slice(0, 300);
    throw new Error(`Claude API error: ${msg}`);
  }
  return (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n").trim();
}

// This endpoint spends our Anthropic credits, so it must not be usable by anyone
// who happens to know the URL. Require a real Supabase session — the same bearer
// token landlordDb.js already sends to /api/landlord-team.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

async function signedInError(req) {
  const raw = req.headers.authorization || req.headers.Authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
  if (!token) return "Please sign in again — this request arrived without a session.";
  if (!SUPABASE_URL || !SUPABASE_ANON) return "This server is missing its authentication settings.";
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return "Your session has expired — sign out and back in, then try again.";
  } catch {
    return "Could not check your sign-in just now. Please try again.";
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const authError = await signedInError(req);
  if (authError) return res.status(401).json({ ok: false, error: authError });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: "ANTHROPIC_API_KEY is not set. Add it in Vercel -> Settings -> Environment Variables, then redeploy." });

  try {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
    const pdfBase64 = body && body.pdfBase64;
    if (!pdfBase64) return res.status(400).json({ ok: false, error: "Missing pdfBase64." });
    if (pdfBase64.length > 6 * 1024 * 1024) return res.status(400).json({ ok: false, error: "PDF is too large — please upload a single bill (under ~4 MB)." });

    const text = await anthropic(apiKey, {
      model: MODEL, max_tokens: 4000, system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: "Extract this bill into the JSON schema. Return ONLY the JSON object." }
      ] }]
    });

    const data = safeParseJson(text);
    if (!data) return res.status(502).json({ ok: false, error: "The bill came back unparseable. Try re-uploading, or a clearer PDF." });
    if (!Array.isArray(data.line_items)) data.line_items = [];
    data.line_items = data.line_items.map(li => ({
      description: (li.description == null ? "" : String(li.description)).trim(),
      amount: num(li.amount) || 0,
    })).filter(li => li.description || li.amount);
    data.vendor_name = (data.vendor_name == null ? "" : String(data.vendor_name)).trim();
    data.bill_date = (data.bill_date == null ? "" : String(data.bill_date)).trim();
    data.due_date = (data.due_date == null ? "" : String(data.due_date)).trim();
    data.category = (data.category == null ? "" : String(data.category)).trim().toLowerCase();
    data.total_amount = num(data.total_amount);

    return res.status(200).json({ ok: true, data });
  } catch (e) {
    return res.status(500).json({ ok: false, error: (e && e.message) || String(e) });
  }
}
