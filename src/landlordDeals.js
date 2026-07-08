import { landlordDb as sb } from "./landlordDb.js";

const ok = ({ data, error }) => { if (error) throw error; return data; };
const okVoid = ({ error }) => { if (error) throw error; };

export const STAGES = [
  { value: "lead", label: "Lead" },
  { value: "analyzing", label: "Analyzing" },
  { value: "under_contract", label: "Under contract" },
  { value: "closing", label: "Closing" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export const DEFAULT_STEPS = [
  "Choose attorney", "LLC formation", "Due diligence inspection",
  "Scope of work", "Loan process", "Insurance quote", "Bank accounts",
];

/* -------------------------------- deals -------------------------------- */
export async function listDeals(accountId) {
  return sb.from("landlord_deals")
    .select("*, seller:landlord_contacts(id,name), linked:landlord_properties(id,label,full_address)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .then(ok);
}
export const updateDeal = (id, patch) => sb.from("landlord_deals").update(patch).eq("id", id).select().single().then(ok);
export const removeDeal = (id) => sb.from("landlord_deals").delete().eq("id", id).then(okVoid);

export async function createDeal(accountId, patch) {
  const deal = await sb.from("landlord_deals").insert({ account_id: accountId, stage: "lead", ...patch }).select().single().then(ok);
  const steps = DEFAULT_STEPS.map((label, idx) => ({ account_id: accountId, deal_id: deal.id, step_label: label, sort_order: idx }));
  await sb.from("landlord_deal_checklist").insert(steps).then(okVoid);
  return deal;
}

/* ------------------------------ checklist ------------------------------ */
export async function listChecklist(dealId) {
  return sb.from("landlord_deal_checklist").select("*").eq("deal_id", dealId).order("sort_order", { ascending: true }).then(ok);
}
export const updateStep = (id, patch) => sb.from("landlord_deal_checklist").update(patch).eq("id", id).then(okVoid);
export const removeStep = (id) => sb.from("landlord_deal_checklist").delete().eq("id", id).then(okVoid);
export const addStep = (obj) => sb.from("landlord_deal_checklist").insert(obj).select().single().then(ok);

/* ------------------------------ analyses ------------------------------- */
export async function listAnalyses(accountId) {
  return sb.from("landlord_deal_analysis")
    .select("*, deal:landlord_deals(id,label,address)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .then(ok);
}
export const createAnalysis = (obj) => sb.from("landlord_deal_analysis").insert(obj).select().single().then(ok);
export const removeAnalysis = (id) => sb.from("landlord_deal_analysis").delete().eq("id", id).then(okVoid);

/* --------------------------- analyzer math ----------------------------- */
// Backward compatible: older saved analyses have no reserves/splits/owner-draw
// keys — n() treats missing as 0, and splits defaults to an empty list.
export function computeAnalysis(i) {
  const n = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
  const purchase = n(i.purchase_price), rehab = n(i.rehab_cost), closing = n(i.closing_cost);
  const arv = n(i.arv), ltv = n(i.refi_ltv) / 100, rate = n(i.rate) / 100;
  const io = !!i.interest_only, years = n(i.amort_years) || 30;
  const rent = n(i.monthly_rent), taxes = n(i.annual_taxes), ins = n(i.annual_insurance), other = n(i.other_monthly);
  const payoff = n(i.loan_payoff), refiCost = n(i.refi_cost);
  const salePrice = n(i.exit_sale_price), saleCostPct = n(i.exit_cost_pct) / 100;
  const reserveMonths = n(i.reserve_months), ownerDraw = n(i.owner_draw_monthly);

  const allIn = purchase + rehab + closing;
  const refiLoan = arv * ltv;
  const rMo = rate / 12;
  let pi;
  if (io) pi = refiLoan * rMo;
  else {
    const nMo = years * 12;
    pi = rMo > 0 ? (refiLoan * rMo * Math.pow(1 + rMo, nMo)) / (Math.pow(1 + rMo, nMo) - 1) : refiLoan / nMo;
  }
  const piti = pi + taxes / 12 + ins / 12 + other;
  const dscr = piti > 0 ? rent / piti : 0;
  const monthlyCF = rent - piti;
  const annualCF = monthlyCF * 12;

  // Operating metrics (before debt service)
  const noiMonthly = rent - (taxes / 12 + ins / 12 + other);
  const noi = noiMonthly * 12;
  const capRate = allIn > 0 ? (noi / allIn) * 100 : 0;
  const onePct = purchase > 0 ? (rent / purchase) * 100 : 0;   // want >= 1.0
  const grm = rent * 12 > 0 ? allIn / (rent * 12) : 0;

  // Cash position
  const cashReturned = refiLoan - payoff - refiCost;
  const cashLeftIn = allIn - (refiLoan - payoff);
  const reserves = reserveMonths * piti;                       // cash set aside
  const totalCashNeeded = Math.max(0, cashLeftIn) + reserves;
  const coc = cashLeftIn > 0 ? (annualCF / cashLeftIn) * 100 : null; // null = all capital pulled out

  // Owner draw ("profit first") reduces retained cash flow
  const netMonthlyCF = monthlyCF - ownerDraw;
  const netAnnualCF = netMonthlyCF * 12;

  // Exit
  const saleProceeds = salePrice * (1 - saleCostPct) - payoff;

  // Partner splits — allocate cash-in and annual cash flow by percentage
  const rawSplits = Array.isArray(i.splits) ? i.splits : [];
  const splitBase = cashLeftIn > 0 ? cashLeftIn : 0;
  const splits = rawSplits
    .filter((sp) => sp && (sp.name || sp.pct))
    .map((sp) => {
      const pct = n(sp.pct);
      return { name: sp.name || "Partner", pct, cash_in: splitBase * pct / 100, annual_cf: annualCF * pct / 100 };
    });
  const splitPctTotal = splits.reduce((a, sp) => a + sp.pct, 0);

  // Simple verdict
  let verdict = "review", verdictNote = "";
  if (piti === 0 && rent === 0) { verdict = "review"; verdictNote = "Enter rent and loan terms to score this deal."; }
  else if (dscr >= 1.25 && monthlyCF >= 0 && (coc === null || coc >= 8)) { verdict = "pass"; verdictNote = "Strong: covers debt with margin and healthy return."; }
  else if (dscr >= 1.0 && monthlyCF >= 0) { verdict = "watch"; verdictNote = "Workable but thin — check reserves and rate assumptions."; }
  else { verdict = "fail"; verdictNote = "Negative cash flow or DSCR below 1.0 at these numbers."; }

  return {
    allIn, refiLoan, pi, piti, dscr, monthlyCF, annualCF,
    noi, capRate, onePct, grm,
    cashReturned, cashLeftIn, reserves, totalCashNeeded, coc,
    ownerDraw, netMonthlyCF, netAnnualCF,
    saleProceeds, splits, splitPctTotal, verdict, verdictNote,
  };
}
