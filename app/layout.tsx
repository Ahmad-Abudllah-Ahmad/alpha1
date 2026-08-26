import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/lib/themeCookie";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "ADICC Construction Platform",
  title: {
    default: "ADICC Construction Platform",
    template: "%s · ADICC",
  },
  description: "Estimation, scheduling, contracts, and document intelligence for ADICC projects.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

/**
 * Runs before paint. Only mutates `<html class>` when localStorage/OS disagrees
 * with the server cookie render — avoids React #418 hydration mismatch on repeat
 * loads while still preventing a theme flash on first visit.
 */
const themeInitScript = `(function(){try{var t=localStorage.getItem('adicc-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);var root=document.documentElement;var hasDark=root.classList.contains('dark');if(d!==hasDark)root.classList.toggle('dark',d);document.cookie='${THEME_COOKIE}='+(d?'dark':'light')+';path=/;max-age=31536000;SameSite=Lax';}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value;
  const htmlClass = [
    inter.variable,
    themeCookie === "dark" ? "dark" : "",
  ].filter(Boolean).join(" ");

  return (
    <html lang="en" suppressHydrationWarning className={htmlClass || undefined}>
      <body suppressHydrationWarning className="antialiased">
        <Script id="adicc-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
