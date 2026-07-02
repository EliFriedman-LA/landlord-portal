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

export function money(n) {
  if (n === null || n === undefined || n === "") return "$0";
  return "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
