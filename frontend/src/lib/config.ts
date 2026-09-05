// Public (publishable) configuration. These values are safe in client code.
// Override per-environment with VITE_* variables.

const env = import.meta.env as Record<string, string | undefined>;

export const SUPABASE_URL = env["VITE_SUPABASE_URL"] ?? "https://feqqdeqzviezciyvxmmj.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
  env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
  env["VITE_SUPABASE_ANON_KEY"] ??
  "sb_publishable_SzvnfT979eTCzyiKgWZesA_2qZrs_LS";

export const API_URL = env["VITE_API_URL"] ?? "https://mk1311-mk1311-mkchain-api.hf.space";
