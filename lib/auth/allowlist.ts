import { normalizeEmail } from "@/lib/auth/session";

/**
 * Hardcoded ADICC seat allowlist — frontend gate only.
 * No database table. Only these emails may register / attempt login.
 */
export const ALLOWED_AUTH_EMAILS = [
  "mani.k@adicc-uae.com",
  "b.burce@adicc-uae.com",
  "babu.g@adicc-uae.com",
  "amr.h@adicc-uae.com",
  "tooba@sparkai.ae",
  "itsadildev@gmail.com",
] as const;

const ALLOWED_SET = new Set(
  ALLOWED_AUTH_EMAILS.map((email) => normalizeEmail(email)),
);

export function isAllowedAuthEmail(email: string): boolean {
  return ALLOWED_SET.has(normalizeEmail(email));
}

export const AUTH_TOAST = {
  maxUsers:
    "Maximum user limit reached. New registrations are closed for this workspace.",
  invalidCredentials: "Invalid credentials. Check your email and password.",
  alreadyRegistered:
    "This email is already registered. Please sign in instead.",
} as const;
