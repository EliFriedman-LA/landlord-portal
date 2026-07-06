import React from "react";

export const PW_RULES = [
  { key: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "num", label: "A number", test: (p) => /[0-9]/.test(p) },
  { key: "sym", label: "A symbol", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function pwValid(p) {
  return PW_RULES.every((r) => r.test(p || ""));
}

// Turn a Supabase auth error into something friendly (e.g. leaked-password check).
export function friendlyPwError(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("pwned") || m.includes("leaked") || m.includes("breach") || m.includes("weak") || m.includes("easy to guess"))
    return "That password has shown up in a known data breach. Please choose a different one.";
  return msg || "Could not update password";
}

export function PasswordChecklist({ value }) {
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", fontSize: 12.5 }}>
      {PW_RULES.map((r) => {
        const ok = r.test(value || "");
        return (
          <li key={r.key} style={{ display: "flex", alignItems: "center", gap: 7, color: ok ? "var(--ok, #128a4b)" : "var(--muted, #94a3b8)", padding: "1px 0" }}>
            <span style={{ fontWeight: 700, width: 12, display: "inline-block" }}>{ok ? "✓" : "○"}</span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
