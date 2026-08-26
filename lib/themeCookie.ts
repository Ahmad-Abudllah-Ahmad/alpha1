export const THEME_COOKIE = "adicc-theme";

export function themeCookieValue(isDark: boolean): "dark" | "light" {
  return isDark ? "dark" : "light";
}

/** Persist theme for SSR on the next navigation (matches localStorage key). */
export function writeThemeCookie(theme: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${theme};path=/;max-age=31536000;SameSite=Lax`;
}
