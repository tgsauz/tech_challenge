/**
 * Central place to read and validate environment variables.
 * This helps avoid subtle bugs due to missing keys.
 */
export const config = {
  openAiApiKey: process.env.OPENAI_API_KEY,
  tmdbApiKey: process.env.TMDB_API_KEY,
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID,
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  databaseUrl: process.env.DATABASE_URL
};

export function ensureServerEnv() {
  const missing: string[] = [];

  if (!config.openAiApiKey) missing.push("OPENAI_API_KEY");
  if (!config.tmdbApiKey) missing.push("TMDB_API_KEY");
  if (!config.spotifyClientId) missing.push("SPOTIFY_CLIENT_ID");
  if (!config.spotifyClientSecret) missing.push("SPOTIFY_CLIENT_SECRET");
  if (!config.databaseUrl) missing.push("DATABASE_URL");

  if (missing.length > 0) {
    // In production we throw so we fail fast instead of silently misbehaving.
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

