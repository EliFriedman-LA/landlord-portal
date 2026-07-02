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
export function computeAnalysis(i) {
  const n = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
  const purchase = n(i.purchase_price), rehab = n(i.rehab_cost), closing = n(i.closing_cost);
  const arv = n(i.arv), ltv = n(i.refi_ltv) / 100, rate = n(i.rate) / 100;
  const io = !!i.interest_only, years = n(i.amort_years) || 30;
  const rent = n(i.monthly_rent), taxes = n(i.annual_taxes), ins = n(i.annual_insurance), other = n(i.other_monthly);
  const payoff = n(i.loan_payoff), refiCost = n(i.refi_cost);
  const salePrice = n(i.exit_sale_price), saleCostPct = n(i.exit_cost_pct) / 100;

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
  const cashReturned = refiLoan - payoff - refiCost;
  const cashLeftIn = allIn - (refiLoan - payoff);
  const coc = cashLeftIn > 0 ? (annualCF / cashLeftIn) * 100 : null; // null = all capital pulled out
  const saleProceeds = salePrice * (1 - saleCostPct) - payoff;

  return { allIn, refiLoan, pi, piti, dscr, monthlyCF, annualCF, cashReturned, cashLeftIn, coc, saleProceeds };
}
