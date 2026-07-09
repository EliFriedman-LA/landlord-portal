import { landlordDb as sb } from "./landlordDb.js";

const ok = ({ data, error }) => { if (error) throw error; return data; };
const okVoid = ({ error }) => { if (error) throw error; };

function crud(table) {
  return {
    create: (obj) => sb.from(table).insert(obj).select().single().then(ok),
    update: (id, patch) => sb.from(table).update(patch).eq("id", id).select().single().then(ok),
    remove: (id) => sb.from(table).delete().eq("id", id).then(okVoid),
  };
}

export const income = crud("landlord_income");
export const expenses = crud("landlord_expenses");
export const bills = crud("landlord_bills");
export const billAllocations = crud("landlord_bill_allocations");

// recurring schedules + their per-property split template
export const recurring = crud("landlord_recurring");
export const recurringAllocations = crud("landlord_recurring_allocations");

export async function listIncome(accountId, propertyId) {
  let q = sb.from("landlord_income")
    .select("*, property:landlord_properties(id,label,full_address)")
    .eq("account_id", accountId)
    .order("entry_date", { ascending: false });
  if (propertyId) q = q.eq("property_id", propertyId);
  return q.then(ok);
}

export async function listExpenses(accountId, propertyId) {
  let q = sb.from("landlord_expenses")
    .select("*, property:landlord_properties(id,label,full_address), vendor:landlord_contacts(id,name)")
    .eq("account_id", accountId)
    .order("entry_date", { ascending: false });
  if (propertyId) q = q.eq("property_id", propertyId);
  return q.then(ok);
}

export async function listBills(accountId) {
  return sb.from("landlord_bills")
    .select("*, vendor:landlord_contacts(id,name), allocations:landlord_bill_allocations(id,amount,property_id,property:landlord_properties(id,label,full_address))")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .then(ok);
}

export const PAY_METHODS = [
  { value: "wire", label: "Wire" }, { value: "zelle", label: "Zelle" },
  { value: "check", label: "Check" }, { value: "ach", label: "ACH" },
  { value: "cash", label: "Cash" }, { value: "other", label: "Other" },
];

// Frequency options for a recurring schedule (interval in months).
export const RECUR_INTERVALS = [
  { value: 1, label: "Every month" },
  { value: 2, label: "Every 2 months" },
  { value: 3, label: "Quarterly (every 3 months)" },
  { value: 6, label: "Every 6 months" },
  { value: 12, label: "Annually" },
];

export const RECUR_KINDS = [
  { value: "income", label: "Income (e.g. rent)" },
  { value: "expense", label: "Expense" },
  { value: "bill", label: "Bill (split across properties)" },
];

export function intervalLabel(n) {
  const hit = RECUR_INTERVALS.find((i) => i.value === Number(n));
  return hit ? hit.label : "Every " + n + " months";
}

export function money(n) {
  if (n === null || n === undefined || n === "") return "$0";
  return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ===================================================================
   Recurring engine
   -------------------------------------------------------------------
   Schedules define a rule; occurrences are the concrete due instances.
   Occurrences are materialised lazily (on page load) up to today, then
   confirmed one-by-one into the real income / expense / bill ledgers.
   =================================================================== */

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysInMonth = (y, m /* 0-based */) => new Date(y, m + 1, 0).getDate();
const isoOf = (y, m /* 0-based */, d) =>
  y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");

// All due dates for a schedule from its start through `toIso` (inclusive),
// optionally only those on/after `fromIso`. Day-of-month is clamped to the
// last day of short months (so "the 31st" still fires in February).
function occurrenceDates(schedule, fromIso, toIso) {
  const out = [];
  if (!schedule.start_date) return out;
  const [sy, sm] = schedule.start_date.split("-").map(Number); // sm 1-based
  const step = Number(schedule.interval_months) || 1;
  const dom = Number(schedule.day_of_month) || 1;
  const end = schedule.end_date || null;
  let y = sy, m = sm - 1; // anchor on the start month
  for (let i = 0; i < 600; i++) {
    const day = Math.min(dom, daysInMonth(y, m));
    const due = isoOf(y, m, day);
    if (due > toIso) break;
    const afterStart = due >= schedule.start_date;
    const beforeEnd = !end || due <= end;
    const afterFrom = !fromIso || due >= fromIso;
    if (afterStart && beforeEnd && afterFrom) out.push(due);
    m += step;
    while (m > 11) { m -= 12; y += 1; }
  }
  return out;
}

// Ensure every active schedule has its due-through-today occurrences on file.
// Idempotent: duplicates are ignored via the (recurring_id, due_date) unique key.
export async function ensureOccurrences(accountId) {
  const today = todayIso();
  const schedules = await sb.from("landlord_recurring")
    .select("*").eq("account_id", accountId).eq("active", true).then(ok);
  if (!schedules.length) return 0;

  const toInsert = [];
  for (const s of schedules) {
    const dates = occurrenceDates(s, s.last_generated_date || null, today);
    for (const due of dates) {
      toInsert.push({
        account_id: accountId,
        recurring_id: s.id,
        kind: s.kind,
        due_date: due,
        expected_amount: s.amount,
        status: "pending",
        label: s.label || null,
        category: s.category || null,
        source: s.source || null,
        method: s.method || null,
        property_id: s.property_id || null,
        vendor_contact_id: s.vendor_contact_id || null,
      });
    }
  }
  if (toInsert.length) {
    const { error } = await sb.from("landlord_recurring_occurrences")
      .upsert(toInsert, { onConflict: "recurring_id,due_date", ignoreDuplicates: true });
    if (error) throw error;
  }
  // Advance the watermark so we don't recompute old history next time.
  await sb.from("landlord_recurring").update({ last_generated_date: today })
    .eq("account_id", accountId).eq("active", true);
  return toInsert.length;
}

// Everything still awaiting confirmation, due today or earlier ("outstanding").
export async function listOutstanding(accountId) {
  const today = todayIso();
  return sb.from("landlord_recurring_occurrences")
    .select("*, property:landlord_properties(id,label,full_address), vendor:landlord_contacts(id,name)")
    .eq("account_id", accountId)
    .eq("status", "pending")
    .lte("due_date", today)
    .order("due_date", { ascending: true })
    .then(ok);
}

export async function countOutstanding(accountId) {
  const today = todayIso();
  const { count, error } = await sb.from("landlord_recurring_occurrences")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("status", "pending")
    .lte("due_date", today);
  if (error) throw error;
  return count || 0;
}

// Occurrence history for one schedule (most recent first).
export async function listOccurrences(recurringId) {
  return sb.from("landlord_recurring_occurrences")
    .select("*")
    .eq("recurring_id", recurringId)
    .order("due_date", { ascending: false })
    .then(ok);
}

export async function listSchedules(accountId) {
  return sb.from("landlord_recurring")
    .select("*, property:landlord_properties(id,label,full_address), vendor:landlord_contacts(id,name), allocations:landlord_recurring_allocations(id,amount,property_id,property:landlord_properties(id,label,full_address))")
    .eq("account_id", accountId)
    .order("active", { ascending: false })
    .order("day_of_month", { ascending: true })
    .then(ok);
}

// Confirm an occurrence: writes the real ledger row, then marks it confirmed.
// `amount`/`date`/`method` come from the confirm dialog (amount defaults to the
// expected amount but the user can adjust it — late fees, partial rent, etc.).
export async function confirmOccurrence(occ, { amount, date, method } = {}) {
  const acct = occ.account_id;
  const amt = amount === undefined || amount === null || amount === "" ? Number(occ.expected_amount) : Number(amount);
  const when = date || todayIso();
  const pay = method || occ.method || null;
  const patch = { status: "confirmed", confirmed_amount: amt, confirmed_date: when, confirmed_method: pay };

  if (occ.kind === "income") {
    const row = await income.create({
      account_id: acct, property_id: occ.property_id, entry_date: when,
      category: occ.category || "rent", amount: amt,
      source: occ.source || occ.label || "Recurring", method: pay, reference: "Recurring",
    });
    patch.income_id = row.id;
  } else if (occ.kind === "expense") {
    const row = await expenses.create({
      account_id: acct, property_id: occ.property_id, entry_date: when,
      category: occ.category || null, amount: amt,
      vendor_contact_id: occ.vendor_contact_id || null, method: pay, reference: "Recurring",
    });
    patch.expense_id = row.id;
  } else if (occ.kind === "bill") {
    const bill = await bills.create({
      account_id: acct, vendor_contact_id: occ.vendor_contact_id || null,
      bill_date: when, due_date: occ.due_date, total_amount: amt, status: "paid",
      category: occ.category || null, recurring: false, notes: "Recurring",
    });
    const allocs = await sb.from("landlord_recurring_allocations")
      .select("*").eq("recurring_id", occ.recurring_id).then(ok);
    for (const a of allocs) {
      await billAllocations.create({ account_id: acct, bill_id: bill.id, property_id: a.property_id, amount: a.amount });
    }
    patch.bill_id = bill.id;
  }

  return sb.from("landlord_recurring_occurrences").update(patch).eq("id", occ.id).select().single().then(ok);
}

// Skip an occurrence (vacancy, tenant didn't pay, bill not owed this cycle).
export async function skipOccurrence(id) {
  return sb.from("landlord_recurring_occurrences")
    .update({ status: "skipped" }).eq("id", id).select().single().then(ok);
}
