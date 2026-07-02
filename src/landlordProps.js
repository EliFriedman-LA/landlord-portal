import { landlordDb as sb } from "./landlordDb.js";

// ---- generic CRUD factory ---------------------------------------------------
const ok = ({ data, error }) => { if (error) throw error; return data; };
const okVoid = ({ error }) => { if (error) throw error; };

function crud(table) {
  return {
    list: (match = {}, order = "created_at") =>
      sb.from(table).select("*").match(match).order(order, { ascending: true }).then(ok),
    create: (obj) => sb.from(table).insert(obj).select().single().then(ok),
    update: (id, patch) => sb.from(table).update(patch).eq("id", id).select().single().then(ok),
    remove: (id) => sb.from(table).delete().eq("id", id).then(okVoid),
  };
}

export const entities      = crud("landlord_entities");
export const units         = crud("landlord_units");
export const splits        = crud("landlord_ownership_splits");
export const loans         = crud("landlord_loans");
export const tenants       = crud("landlord_tenants");
export const leases        = crud("landlord_leases");
export const insurance     = crud("landlord_insurance");
export const propertyTax   = crud("landlord_property_tax");
export const registrations = crud("landlord_registrations");
export const contacts      = crud("landlord_contacts");
export const acquisitionFunds = crud("landlord_acquisition_funds");

// ---- properties (with entity name for the list) -----------------------------
export async function listProperties(accountId) {
  return sb
    .from("landlord_properties")
    .select("*, entity:landlord_entities(id,name)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .then(ok);
}
export const createProperty = (obj) => sb.from("landlord_properties").insert(obj).select().single().then(ok);
export const getProperty = (id) =>
  sb.from("landlord_properties").select("*, entity:landlord_entities(id,name)").eq("id", id).single().then(ok);
export const updateProperty = (id, patch) => sb.from("landlord_properties").update(patch).eq("id", id).select().single().then(ok);
export const deleteProperty = (id) => sb.from("landlord_properties").delete().eq("id", id).then(okVoid);

// leases with tenant + unit labels
export async function listLeases(propertyId) {
  return sb
    .from("landlord_leases")
    .select("*, tenant:landlord_tenants(id,name), unit:landlord_units(id,label)")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .then(ok);
}

// property contacts (assignment) joined to the contact record
export async function listPropertyContacts(propertyId) {
  return sb
    .from("landlord_property_contacts")
    .select("id, role, contact:landlord_contacts(id,name,role,company,phone,email)")
    .eq("property_id", propertyId)
    .order("id", { ascending: true })
    .then(ok);
}
export const assignContact = (obj) => sb.from("landlord_property_contacts").insert(obj).select().single().then(ok);
export const unassignContact = (id) => sb.from("landlord_property_contacts").delete().eq("id", id).then(okVoid);

// contacts with the properties they're linked to
export async function listContactsWithProps(accountId) {
  return sb
    .from("landlord_contacts")
    .select("*, links:landlord_property_contacts(role, property:landlord_properties(id,label,full_address))")
    .eq("account_id", accountId)
    .order("name", { ascending: true })
    .then(ok);
}

// documents (read only for now; uploads land in their own batch)
export async function listDocuments(propertyId) {
  return sb
    .from("landlord_documents")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .then(ok);
}
