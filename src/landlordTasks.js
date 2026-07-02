import { landlordDb as sb } from "./landlordDb.js";

const ok = ({ data, error }) => { if (error) throw error; return data; };
const okVoid = ({ error }) => { if (error) throw error; };

/* -------------------------------- tasks -------------------------------- */
export async function listTasks(accountId, includeDone = false) {
  let q = sb.from("landlord_tasks")
    .select("*, property:landlord_properties(id,label,full_address)")
    .eq("account_id", accountId);
  if (!includeDone) q = q.eq("status", "open");
  return q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).then(ok);
}
export const createTask = (obj) => sb.from("landlord_tasks").insert(obj).select().single().then(ok);
export const updateTask = (id, patch) => sb.from("landlord_tasks").update(patch).eq("id", id).select().single().then(ok);
export const removeTask = (id) => sb.from("landlord_tasks").delete().eq("id", id).then(okVoid);

export async function setTaskDone(task, done) {
  return updateTask(task.id, { status: done ? "done" : "open", completed_at: done ? new Date().toISOString() : null });
}

/* ------------------------------ reminders ------------------------------ */
export const createReminder = (obj) => sb.from("landlord_reminders").insert(obj).select().single().then(ok);
export const removeReminder = (id) => sb.from("landlord_reminders").delete().eq("id", id).then(okVoid);

/* ------------------- derived upcoming deadlines ------------------------ */
const propName = (p) => (p ? p.label || p.full_address || "Property" : null);

export async function getUpcoming(accountId) {
  const P = "property:landlord_properties(id,label,full_address)";
  const [ents, ins, regs, leas, tax, lns, rems] = await Promise.all([
    sb.from("landlord_entities").select("id,name,annual_renewal_date").eq("account_id", accountId).then(ok),
    sb.from("landlord_insurance").select(`id,expiration_date,carrier,${P}`).eq("account_id", accountId).then(ok),
    sb.from("landlord_registrations").select(`id,type,expiration_date,${P}`).eq("account_id", accountId).then(ok),
    sb.from("landlord_leases").select(`id,end_date,renewal_reminder_date,${P},tenant:landlord_tenants(name)`).eq("account_id", accountId).then(ok),
    sb.from("landlord_property_tax").select(`id,due_date,${P}`).eq("account_id", accountId).then(ok),
    sb.from("landlord_loans").select(`id,maturity_date,lender,${P}`).eq("account_id", accountId).then(ok),
    sb.from("landlord_reminders").select(`id,title,remind_date,${P}`).eq("account_id", accountId).eq("dismissed", false).then(ok),
  ]);

  const items = [];
  const push = (type, label, date, property) => { if (date) items.push({ id: `${type}-${label}-${date}-${Math.random().toString(36).slice(2, 7)}`, type, label, date, property }); };

  ents.forEach((e) => push("LLC renewal", e.name || "LLC", e.annual_renewal_date, null));
  ins.forEach((i) => push("Insurance", (i.carrier ? i.carrier + " policy" : "Insurance"), i.expiration_date, propName(i.property)));
  regs.forEach((r) => push("Registration", (r.type || "registration").replace(/_/g, " "), r.expiration_date, propName(r.property)));
  leas.forEach((l) => {
    push("Lease end", (l.tenant?.name ? l.tenant.name + " lease" : "Lease"), l.end_date, propName(l.property));
    push("Lease reminder", (l.tenant?.name ? l.tenant.name + " renewal" : "Lease renewal"), l.renewal_reminder_date, propName(l.property));
  });
  tax.forEach((t) => push("Property tax", "Property tax due", t.due_date, propName(t.property)));
  lns.forEach((l) => push("Loan maturity", (l.lender ? l.lender + " maturity" : "Loan maturity"), l.maturity_date, propName(l.property)));
  rems.forEach((r) => push("Reminder", r.title, r.remind_date, propName(r.property)));

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items;
}
