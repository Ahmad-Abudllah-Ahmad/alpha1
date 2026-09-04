"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Barlow_Condensed } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { AdiccLogo } from "@/components/AdiccLogo";
import AdiccLoadingLogo from "@/components/AdiccLoadingLogo";
import { AuthField } from "@/components/auth/AuthField";
import { AuthSkyline } from "@/components/auth/AuthSkyline";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  getSession,
  isValidEmail,
  signIn,
  signUp,
} from "@/lib/auth/session";
import {
  AUTH_TOAST,
  isAllowedAuthEmail,
} from "@/lib/auth/allowlist";
import {
  clearLoginDraft,
  clearRegisterDraft,
  loadLoginDraft,
  loadRegisterDraft,
  saveLoginDraft,
  saveRegisterDraft,
} from "@/lib/auth/formDraft";
import { AuthToast } from "@/components/auth/AuthToast";
import { cn } from "@/lib/utils";

const display = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-auth-display",
  display: "swap",
});

type Mode = "login" | "register";

function AuthLoadingOverlay({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgb(0_47_58/0.72)] backdrop-blur-[2px] [--foreground:244_241_234] [--primary:196_165_116]"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={label}
    >
      <AdiccLoadingLogo />
    </div>
  );
}

function modeFromPath(pathname: string): Mode {
  return pathname.includes("/register") ? "register" : "login";
}

export function AuthExperience() {
  const router = useRouter();
  const pathname = usePathname();
  const mode = modeFromPath(pathname);
  const [ready, setReady] = useState(false);
  const [thumb, setThumb] = useState({ left: 0, width: 0 });
  const tabsRef = useRef<HTMLDivElement>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [fullName, setFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loginDraft = loadLoginDraft();
      const registerDraft = loadRegisterDraft();
      if (!cancelled) {
        setLoginEmail(loginDraft.email);
        setFullName(registerDraft.fullName);
        setRegEmail(registerDraft.email);
      }
      const session = await getSession();
      if (cancelled) return;
      if (session) {
        router.replace("/");
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    saveLoginDraft({ email: loginEmail });
  }, [loginEmail, ready]);

  useEffect(() => {
    if (!ready) return;
    saveRegisterDraft({ fullName, email: regEmail });
  }, [fullName, regEmail, ready]);

  useLayoutEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!active) return;
    setThumb({ left: active.offsetLeft, width: active.offsetWidth });
  }, [mode, ready]);

  useEffect(() => {
    const onResize = () => {
      const root = tabsRef.current;
      if (!root) return;
      const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      setThumb({ left: active.offsetLeft, width: active.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const go = (next: Mode) => {
    router.replace(next === "login" ? "/login" : "/register");
  };

  const onLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = loginEmail.trim();
    if (!trimmedEmail || !loginPassword) {
      setLoginError("Enter your email and password.");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setLoginError("Enter a valid email address.");
      return;
    }
    // Same message for: not on allowlist, not registered, or wrong password.
    if (!isAllowedAuthEmail(trimmedEmail)) {
      showToast(AUTH_TOAST.invalidCredentials);
      setLoginError("");
      return;
    }
    setBusy(true);
    setLoginError("");
    const { session, error } = await signIn(trimmedEmail, loginPassword);
    if (error || !session) {
      setBusy(false);
      showToast(AUTH_TOAST.invalidCredentials);
      return;
    }
    clearLoginDraft();
    setLoginPassword("");
    router.replace("/");
  };

  const onRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = fullName.trim();
    const trimmedEmail = regEmail.trim();
    if (!name || !trimmedEmail || !regPassword || !confirmPassword) {
      setRegError("Fill in all fields.");
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setRegError("Enter a valid email address.");
      return;
    }
    if (!isAllowedAuthEmail(trimmedEmail)) {
      showToast(AUTH_TOAST.maxUsers);
      setRegError("");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Password must be at least 6 characters.");
      return;
    }
    if (regPassword !== confirmPassword) {
      setRegError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setRegError("");
    const { session, error, errorCode, needsConfirm } = await signUp(
      name,
      trimmedEmail,
      regPassword,
    );
    if (error) {
      setBusy(false);
      const already =
        errorCode === "user_already_exists" ||
        /already\s+registered|already\s+exists|user\s+already/i.test(error);
      if (already) {
        showToast(AUTH_TOAST.alreadyRegistered);
        setRegError("");
        return;
      }
      setRegError(error);
      return;
    }
    if (needsConfirm) {
      setBusy(false);
      clearRegisterDraft();
      setRegPassword("");
      setConfirmPassword("");
      setRegError("");
      setLoginError("Check your email to confirm, then sign in.");
      go("login");
      setLoginEmail(trimmedEmail);
      return;
    }
    if (!session) {
      setBusy(false);
      setRegError("Registration failed.");
      return;
    }
    clearRegisterDraft();
    setRegPassword("");
    setConfirmPassword("");
    router.replace("/");
  };

  if (!ready) {
    return (
      <div className={cn(display.variable, "auth-gate relative min-h-svh w-full overflow-hidden")}>
        <AuthLoadingOverlay label="Checking session" />
      </div>
    );
  }

  return (
    <div className={cn(display.variable, "auth-gate relative min-h-svh w-full overflow-hidden")}>
      <div className="auth-gate-grid" aria-hidden="true" />
      <div className="auth-gate-wash" aria-hidden="true" />
      <p className="auth-watermark" aria-hidden="true">
        ADICC
      </p>

      <header className="relative z-20 flex items-center justify-between px-5 py-4 sm:px-8 lg:px-10">
        <AdiccLogo variant="header" className="[&_img]:h-7 sm:[&_img]:h-8" />
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <div className="relative z-20 mx-auto grid min-h-[calc(100svh-5.5rem)] w-full max-w-6xl items-center gap-10 px-5 pb-28 pt-4 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-10 lg:pb-32">
        <section className="auth-hero">
          <p className="auth-kicker">Abu Dhabi International Contracting</p>
          <div className="auth-hero-copy" data-mode={mode}>
            <div className="auth-hero-panel" data-panel="login">
              <h1 className="auth-display">
                Enter the
                <span className="block text-[var(--ink-gold)]">project desk.</span>
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink-paper)]/68 sm:text-base">
                Pick up live takeoff, schedule risk, and contract review — the same desk your site runs on.
              </p>
            </div>
            <div className="auth-hero-panel" data-panel="register">
              <h1 className="auth-display">
                Claim your
                <span className="block text-[var(--ink-gold)]">site seat.</span>
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[var(--ink-paper)]/68 sm:text-base">
                Cut a gate pass for the ADICC desk. One seat covers takeoff, schedule, and contracts.
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <div className="auth-seal" aria-hidden="true">
              <span>Since</span>
              <strong>1989</strong>
            </div>
            <ul className="space-y-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-paper)]/55">
              <li>Estimation ready</li>
              <li>Schedule controls</li>
              <li>Contract intelligence</li>
            </ul>
          </div>
        </section>

        <div className="auth-pass-stage justify-self-stretch lg:justify-self-end lg:w-full lg:max-w-[26rem]">
          <div className="auth-folder" data-mode={mode}>
            <div className="auth-folder-tabs" ref={tabsRef} role="tablist" aria-label="Account">
              <span
                className="auth-folder-thumb"
                style={{ transform: `translateX(${thumb.left}px)`, width: thumb.width || undefined }}
                aria-hidden="true"
              />
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={cn("auth-folder-tab", mode === "login" && "is-on")}
                onClick={() => go("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={cn("auth-folder-tab", mode === "register" && "is-on")}
                onClick={() => go("register")}
              >
                Register
              </button>
            </div>

            <section className="auth-pass relative">
              <div className="auth-pass-body">
                <div className="auth-pass-meta">
                  <AdiccLogo variant="banner" className="hidden shrink-0 sm:block [&_img]:h-7" />
                </div>

              <div className="auth-pass-viewport mt-3" data-mode={mode}>
                <div className="auth-pass-track">
                  <div
                    className="auth-pass-panel"
                    role="tabpanel"
                    aria-hidden={mode !== "login"}
                    inert={mode !== "login" ? true : undefined}
                  >
                    <form className="auth-pass-form" onSubmit={onLogin} noValidate>
                      <div className="auth-field-stack">
                        <AuthField
                          label="Email"
                          type="email"
                          autoComplete="email"
                          value={loginEmail}
                          onChange={(event) => {
                            setLoginEmail(event.target.value);
                            setLoginError("");
                          }}
                        />
                        <AuthField
                          label="Password"
                          type="password"
                          autoComplete="current-password"
                          value={loginPassword}
                          onChange={(event) => {
                            setLoginPassword(event.target.value);
                            setLoginError("");
                          }}
                        />
                        {loginError ? <p className="text-sm text-destructive">{loginError}</p> : null}
                      </div>
                      <div className="auth-pass-actions">
                        <button type="submit" className="auth-action-go" disabled={busy}>
                          <span className="auth-action-go-copy">Enter site</span>
                          <span className="auth-action-go-punch" aria-hidden="true">
                            <ArrowRight className="auth-action-go-icon" />
                          </span>
                        </button>
                        <button
                          type="button"
                          className="auth-action-alt"
                          onClick={() => go("register")}
                          disabled={busy}
                        >
                          Register
                        </button>
                      </div>
                    </form>
                  </div>

                  <div
                    className="auth-pass-panel"
                    role="tabpanel"
                    aria-hidden={mode !== "register"}
                    inert={mode !== "register" ? true : undefined}
                  >
                    <form className="auth-pass-form" onSubmit={onRegister} noValidate>
                      <div className="auth-field-stack">
                        <AuthField
                          label="Full Name"
                          type="text"
                          autoComplete="name"
                          value={fullName}
                          onChange={(event) => {
                            setFullName(event.target.value);
                            setRegError("");
                          }}
                        />
                        <AuthField
                          label="Email"
                          type="email"
                          autoComplete="email"
                          value={regEmail}
                          onChange={(event) => {
                            setRegEmail(event.target.value);
                            setRegError("");
                          }}
                        />
                        <AuthField
                          label="Password"
                          type="password"
                          autoComplete="new-password"
                          value={regPassword}
                          onChange={(event) => {
                            setRegPassword(event.target.value);
                            setRegError("");
                          }}
                        />
                        <AuthField
                          label="Confirm password"
                          type="password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(event) => {
                            setConfirmPassword(event.target.value);
                            setRegError("");
                          }}
                        />
                        {regError ? <p className="text-sm text-destructive">{regError}</p> : null}
                      </div>
                      <div className="auth-pass-actions">
                        <button type="submit" className="auth-action-go" disabled={busy}>
                          <span className="auth-action-go-copy">Create pass</span>
                          <span className="auth-action-go-punch" aria-hidden="true">
                            <ArrowRight className="auth-action-go-icon" />
                          </span>
                        </button>
                        <button
                          type="button"
                          className="auth-action-alt"
                          onClick={() => go("login")}
                          disabled={busy}
                        >
                          Sign in
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </section>
          </div>
        </div>
      </div>

      <AuthSkyline className="auth-skyline pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[9.5rem] w-full sm:h-[11rem] lg:h-[13rem]" />
      {busy ? <AuthLoadingOverlay label={mode === "login" ? "Signing in" : "Creating account"} /> : null}
      <AuthToast message={toast} onDismiss={() => setToast(null)} />
      {/* Keep Link for crawlability; UI uses buttons above */}
      <Link href="/login" className="sr-only">
        Sign in
      </Link>
      <Link href="/register" className="sr-only">
        Register
      </Link>
    </div>
  );
}
