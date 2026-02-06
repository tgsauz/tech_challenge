/**
 * Central place to read and validate environment variables.
 * This helps avoid subtle bugs due to missing keys.
 */
const IS_TEST =
  process.env.NODE_ENV === "test" || process.env.VITEST === "true";

function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    if (IS_TEST) {
      if (name === "SUPABASE_URL") {
        return "http://localhost";
      }
      return "test";
    }
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

// Export validated, typed constants for consumers to use directly.
export const OPENAI_API_KEY = getRequiredEnv("OPENAI_API_KEY");
export const TMDB_API_KEY = getRequiredEnv("TMDB_API_KEY");
export const DATABASE_URL = getRequiredEnv("DATABASE_URL");
export const SUPABASE_URL = getRequiredEnv("SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = getRequiredEnv(
  "SUPABASE_SERVICE_ROLE_KEY"
);

// Backwards-compatible object for existing imports
export const config = {
  openAiApiKey: OPENAI_API_KEY,
  tmdbApiKey: TMDB_API_KEY,
  databaseUrl: DATABASE_URL,
  supabaseUrl: SUPABASE_URL,
  supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY
};

export function ensureServerEnv() {
  // kept for compatibility - constants are validated on import
  return;
}
