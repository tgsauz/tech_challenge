/**
 * Central place to read and validate environment variables.
 * This helps avoid subtle bugs due to missing keys.
 */
function getRequiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

// Export validated, typed constants for consumers to use directly.
export const OPENAI_API_KEY = getRequiredEnv("OPENAI_API_KEY");
export const TMDB_API_KEY = getRequiredEnv("TMDB_API_KEY");
export const SPOTIFY_CLIENT_ID = getRequiredEnv("SPOTIFY_CLIENT_ID");
export const SPOTIFY_CLIENT_SECRET = getRequiredEnv("SPOTIFY_CLIENT_SECRET");
export const DATABASE_URL = getRequiredEnv("DATABASE_URL");
export const SUPABASE_URL = getRequiredEnv("SUPABASE_URL");
export const SUPABASE_SERVICE_ROLE_KEY = getRequiredEnv(
  "SUPABASE_SERVICE_ROLE_KEY"
);

// Backwards-compatible object for existing imports
export const config = {
  openAiApiKey: OPENAI_API_KEY,
  tmdbApiKey: TMDB_API_KEY,
  spotifyClientId: SPOTIFY_CLIENT_ID,
  spotifyClientSecret: SPOTIFY_CLIENT_SECRET,
  databaseUrl: DATABASE_URL,
  supabaseUrl: SUPABASE_URL,
  supabaseServiceRoleKey: SUPABASE_SERVICE_ROLE_KEY
};

export function ensureServerEnv() {
  // kept for compatibility - constants are validated on import
  return;
}

