/** Persist non-password auth form drafts across Login/Register tab switches. */

const LOGIN_KEY = "adicc.auth.draft.login";
const REGISTER_KEY = "adicc.auth.draft.register";

export type LoginDraft = {
  email: string;
};

export type RegisterDraft = {
  fullName: string;
  email: string;
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode
  }
}

export function loadLoginDraft(): LoginDraft {
  const draft = read<Partial<LoginDraft>>(LOGIN_KEY, {});
  return { email: typeof draft.email === "string" ? draft.email : "" };
}

export function saveLoginDraft(draft: LoginDraft) {
  write(LOGIN_KEY, { email: draft.email });
}

export function clearLoginDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LOGIN_KEY);
}

export function loadRegisterDraft(): RegisterDraft {
  const draft = read<Partial<RegisterDraft>>(REGISTER_KEY, {});
  return {
    fullName: typeof draft.fullName === "string" ? draft.fullName : "",
    email: typeof draft.email === "string" ? draft.email : "",
  };
}

export function saveRegisterDraft(draft: RegisterDraft) {
  write(REGISTER_KEY, {
    fullName: draft.fullName,
    email: draft.email,
  });
}

export function clearRegisterDraft() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(REGISTER_KEY);
}
