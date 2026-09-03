import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client — Auth / session only.
 * Do not use this client for .from(), .rpc(), or storage against any database tables.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
