import { landlordDb as sb } from "./landlordDb.js";

const BUCKET = "landlord-docs";

const ok = ({ data, error }) => { if (error) throw error; return data; };
const okVoid = ({ error }) => { if (error) throw error; };

export const DOC_CATEGORIES = [
  "Deed", "Title policy", "Survey", "Inspection", "Lease",
  "Insurance", "Tax", "Loan", "Closing", "Other",
];

function safeName(name) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
  const ext = dot > 0 ? name.slice(dot).replace(/[^a-zA-Z0-9.]+/g, "") : "";
  return (base || "file") + ext;
}

export async function listDocs(propertyId) {
  return sb
    .from("landlord_documents")
    .select("*")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })
    .then(ok);
}

// All documents across the account, with the property they belong to.
export async function listAllDocs(accountId) {
  return sb
    .from("landlord_documents")
    .select("*, property:landlord_properties(id,label,full_address)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .then(ok);
}

export async function uploadDoc(accountId, propertyId, file, category) {
  const path = `${accountId}/${propertyId}/${Date.now()}-${safeName(file.name)}`;

  const up = await sb.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (up.error) throw up.error;

  let uploadedBy = null;
  try { uploadedBy = (await sb.auth.getUser()).data.user?.id || null; } catch { /* ignore */ }

  return sb
    .from("landlord_documents")
    .insert({
      account_id: accountId,
      property_id: propertyId,
      name: file.name,
      category: category || null,
      storage_path: path,
      mime_type: file.type || null,
      size_bytes: file.size || null,
      source: "upload",
      uploaded_by: uploadedBy,
    })
    .select()
    .single()
    .then(ok);
}

export async function signedUrl(path, seconds = 120) {
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeDoc(doc) {
  const { error: sErr } = await sb.storage.from(BUCKET).remove([doc.storage_path]);
  if (sErr) throw sErr;
  return sb.from("landlord_documents").delete().eq("id", doc.id).then(okVoid);
}

export function formatSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
