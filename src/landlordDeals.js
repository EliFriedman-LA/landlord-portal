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
export const ANALYSIS_MODES = [
  { key: "purchase",    label: "Financed purchase" },
  { key: "refi",        label: "Refinance" },
  { key: "brrrr_cash",  label: "BRRRR (cash)" },
  { key: "brrrr_loan",  label: "BRRRR (loan)" },
];

export function computeAnalysis(i) {
  const n = (v) => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));
  let mode = i.financing_mode || "purchase";
  if (mode === "brrrr") mode = "brrrr_cash";           // back-compat with earlier 2-mode version

  const purchase = n(i.purchase_price), rehab = n(i.rehab_cost), closing = n(i.closing_cost);
  const rate = n(i.rate) / 100, io = !!i.interest_only, years = n(i.amort_years) || 30;
  const rent = n(i.monthly_rent), taxes = n(i.annual_taxes), ins = n(i.annual_insurance), other = n(i.other_monthly);
  const salePrice = n(i.exit_sale_price), saleCostPct = n(i.exit_cost_pct) / 100;
  const reserveMonths = n(i.reserve_months), ownerDraw = n(i.owner_draw_monthly);

  const allIn = purchase + rehab + closing;
  const rMo = rate / 12;
  const monthlyPI = (loanAmt) => {
    if (loanAmt <= 0) return 0;
    if (io) return loanAmt * rMo;
    const nMo = years * 12;
    return rMo > 0 ? (loanAmt * rMo * Math.pow(1 + rMo, nMo)) / (Math.pow(1 + rMo, nMo) - 1) : loanAmt / nMo;
  };

  // Down payment / acquisition loan on the PURCHASE price (used by purchase + brrrr_loan)
  const acqLoanFor = () => {
    const explicit = n(i.purchase_loan_amount);
    let loan = explicit > 0 ? explicit : purchase * (1 - n(i.down_payment_pct) / 100);
    if (loan < 0) loan = 0;
    if (loan > purchase) loan = purchase;
    return loan;
  };
  // Refinance loan sizing (used by refi + both BRRRR modes)
  const refiLoanFor = (basis) => {
    const explicit = n(i.refi_new_loan);
    return explicit > 0 ? explicit : basis * (n(i.refi_ltv) / 100);
  };

  let loanAmount = 0, downPayment = 0, refiLoan = 0, cashReturned = 0, cashLeftIn = 0, outstanding = 0;
  const refiCost = n(i.refi_cost);

  if (mode === "purchase") {
    loanAmount = acqLoanFor();
    downPayment = purchase - loanAmount;
    cashLeftIn = downPayment + rehab + closing;
    outstanding = loanAmount;
  } else if (mode === "refi") {
    const basis = n(i.property_value) || n(i.arv) || purchase;   // value the refi is sized against
    const payoff = n(i.loan_payoff);
    refiLoan = refiLoanFor(basis);
    loanAmount = refiLoan;
    cashReturned = refiLoan - payoff - refiCost;                  // + = cash out, - = cash to close
    cashLeftIn = cashReturned < 0 ? -cashReturned : 0;            // owned already; only new cash counts
    outstanding = refiLoan;
  } else if (mode === "brrrr_loan") {
    const acqLoan = acqLoanFor();
    downPayment = purchase - acqLoan;
    const initialCash = downPayment + rehab + closing;
    refiLoan = refiLoanFor(n(i.arv));
    loanAmount = refiLoan;
    cashReturned = refiLoan - acqLoan - refiCost;                 // refi pays off the acquisition loan
    cashLeftIn = initialCash - cashReturned;
    outstanding = refiLoan;
  } else { // brrrr_cash
    refiLoan = refiLoanFor(n(i.arv));
    loanAmount = refiLoan;
    cashReturned = refiLoan - refiCost;                           // nothing to pay off (bought cash)
    cashLeftIn = allIn - refiLoan;
    outstanding = refiLoan;
  }

  const pi = monthlyPI(loanAmount);
  const piti = pi + taxes / 12 + ins / 12 + other;
  const dscr = piti > 0 ? rent / piti : 0;
  const monthlyCF = rent - piti;
  const annualCF = monthlyCF * 12;

  const noi = (rent - (taxes / 12 + ins / 12 + other)) * 12;
  const capRate = allIn > 0 ? (noi / allIn) * 100 : 0;
  const onePct = purchase > 0 ? (rent / purchase) * 100 : 0;
  const grm = rent * 12 > 0 ? allIn / (rent * 12) : 0;

  const reserves = reserveMonths * piti;
  const totalCashNeeded = Math.max(0, cashLeftIn) + reserves;
  const coc = cashLeftIn > 0 ? (annualCF / cashLeftIn) * 100 : null;

  const netMonthlyCF = monthlyCF - ownerDraw;
  const netAnnualCF = netMonthlyCF * 12;

  const saleProceeds = salePrice * (1 - saleCostPct) - outstanding;

  const rawSplits = Array.isArray(i.splits) ? i.splits : [];
  const splitBase = cashLeftIn > 0 ? cashLeftIn : 0;
  const splits = rawSplits
    .filter((sp) => sp && (sp.name || sp.pct))
    .map((sp) => {
      const pct = n(sp.pct);
      return { name: sp.name || "Partner", pct, cash_in: splitBase * pct / 100, annual_cf: annualCF * pct / 100 };
    });
  const splitPctTotal = splits.reduce((a, sp) => a + sp.pct, 0);

  let verdict = "review", verdictNote = "";
  if (piti === 0 && rent === 0) { verdict = "review"; verdictNote = "Enter rent and loan terms to score this deal."; }
  else if (dscr >= 1.25 && monthlyCF >= 0 && (coc === null || coc >= 8)) { verdict = "pass"; verdictNote = "Strong: covers debt with margin and healthy return."; }
  else if (dscr >= 1.0 && monthlyCF >= 0) { verdict = "watch"; verdictNote = "Workable but thin - check reserves and rate assumptions."; }
  else { verdict = "fail"; verdictNote = "Negative cash flow or DSCR below 1.0 at these numbers."; }

  return {
    mode, allIn, loanAmount, downPayment, refiLoan, pi, piti, dscr, monthlyCF, annualCF,
    noi, capRate, onePct, grm,
    cashReturned, cashLeftIn, reserves, totalCashNeeded, coc,
    ownerDraw, netMonthlyCF, netAnnualCF,
    saleProceeds, splits, splitPctTotal, verdict, verdictNote,
  };
}

// Run all four strategies against one input set (for the side-by-side comparison).
export function compareAllStrategies(inputs) {
  return ANALYSIS_MODES.map((m) => ({ ...m, out: computeAnalysis({ ...inputs, financing_mode: m.key }) }));
}
