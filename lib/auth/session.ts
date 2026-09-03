/** Auth session helpers — Supabase Auth API only. No database table access. */

import { createClient } from "@/lib/supabase/client";

export type AuthSession = {
  fullName: string;
  email: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function sessionFromUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): AuthSession | null {
  const email = user.email ? normalizeEmail(user.email) : "";
  if (!email) return null;
  const meta = user.user_metadata ?? {};
  const fullName =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.fullName === "string"
        ? meta.fullName
        : "";
  return { email, fullName: fullName.trim() };
}

/** Current Auth session (browser). Auth API only. */
export async function getSession(): Promise<AuthSession | null> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return sessionFromUser(data.user);
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ session: AuthSession | null; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
  });
  if (error) {
    return { session: null, error: error.message };
  }
  if (!data.user) {
    return { session: null, error: "Sign in failed." };
  }
  return { session: sessionFromUser(data.user), error: null };
}

export async function signUp(
  fullName: string,
  email: string,
  password: string,
): Promise<{
  session: AuthSession | null;
  error: string | null;
  errorCode: string | null;
  needsConfirm: boolean;
}> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email: normalizeEmail(email),
    password,
    options: {
      data: { full_name: fullName.trim() },
    },
  });
  if (error) {
    return {
      session: null,
      error: error.message,
      errorCode: error.code ?? null,
      needsConfirm: false,
    };
  }
  if (!data.user) {
    return {
      session: null,
      error: "Registration failed.",
      errorCode: null,
      needsConfirm: false,
    };
  }
  // If email confirmation is required, session may be null.
  if (!data.session) {
    // Supabase may return a user with empty identities when email already exists
    // and confirm-email is on (anti-enumeration). Treat as already registered.
    const identities = data.user.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      return {
        session: null,
        error: "User already registered",
        errorCode: "user_already_exists",
        needsConfirm: false,
      };
    }
    return {
      session: null,
      error: null,
      errorCode: null,
      needsConfirm: true,
    };
  }
  return {
    session: sessionFromUser(data.user),
    error: null,
    errorCode: null,
    needsConfirm: false,
  };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
}

/** @deprecated use signOut — kept name for call-site clarity during migration */
export async function clearSession(): Promise<void> {
  await signOut();
}
