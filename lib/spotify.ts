/**
 * Spotify Web API client.
 * Handles OAuth token retrieval and track search, details, recommendations.
 */

import { z } from "zod";
import { config } from "./config";

const SPOTIFY_BASE_URL = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

// In-memory cache for access token (expires after 1 hour)
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Spotify access token using Client Credentials flow.
 * This is suitable for server-side use (no user login required).
 * Tokens are cached to avoid unnecessary requests.
 */
async function getAccessToken(): Promise<string> {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw new Error("Spotify credentials are not configured");
  }

  // Return cached token if still valid (with 5 minute buffer)
  if (
    cachedToken &&
    cachedToken.expiresAt > Date.now() + 5 * 60 * 1000
  ) {
    return cachedToken.token;
  }

  // Request new token
  const credentials = Buffer.from(
    `${config.spotifyClientId}:${config.spotifyClientSecret}`
  ).toString("base64");

  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Spotify client credentials are invalid");
      }
      throw new Error(
        `Spotify token request failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    const token = data.access_token as string;
    const expiresIn = (data.expires_in as number) || 3600; // Default 1 hour

    cachedToken = {
      token,
      expiresAt: Date.now() + expiresIn * 1000
    };

    return token;
  } catch (error) {
    throw new Error(`Failed to get Spotify access token: ${error}`);
  }
}

// Zod schemas for Spotify API responses
const SpotifyArtistSchema = z.object({
  name: z.string()
});

const SpotifyAlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  release_date: z.string().optional(),
  images: z
    .array(
      z.object({
        url: z.string()
      })
    )
    .optional()
});

const SpotifyTrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  artists: z.array(SpotifyArtistSchema),
  album: SpotifyAlbumSchema,
  preview_url: z.string().nullable(),
  popularity: z.number().optional(),
  duration_ms: z.number().optional()
});

const SpotifySearchResponseSchema = z.object({
  tracks: z.object({
    items: z.array(SpotifyTrackSchema)
  })
});

const SpotifyTrackDetailsSchema = SpotifyTrackSchema;

const SpotifyRecommendationsResponseSchema = z.object({
  tracks: z.array(SpotifyTrackSchema)
});

// Types we'll use in our app
export type TrackSummary = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  releaseYear: number | null;
  previewUrl: string | null;
  popularity?: number;
};

export type TrackDetails = TrackSummary & {
  durationMs?: number;
  albumId: string;
};

/**
 * Search for tracks (songs) on Spotify.
 */
export async function searchTracks(query: string): Promise<TrackSummary[]> {
  const token = await getAccessToken();

  const url = new URL(`${SPOTIFY_BASE_URL}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "20");
  url.searchParams.set("market", "US");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token might be expired, try once more
        cachedToken = null;
        return searchTracks(query);
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(
          `Spotify API rate limit exceeded. Retry after ${retryAfter || "60"} seconds.`
        );
      }
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = SpotifySearchResponseSchema.parse(data);

    return parsed.tracks.items.map((track) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album.name,
      releaseYear: track.album.release_date
        ? parseInt(track.album.release_date.split("-")[0], 10)
        : null,
      previewUrl: track.preview_url,
      popularity: track.popularity
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Spotify API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get detailed information about a track by ID.
 */
export async function getTrackDetails(trackId: string): Promise<TrackDetails> {
  const token = await getAccessToken();

  const url = new URL(`${SPOTIFY_BASE_URL}/tracks/${trackId}`);
  url.searchParams.set("market", "US");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedToken = null;
        return getTrackDetails(trackId);
      }
      if (response.status === 404) {
        throw new Error(`Track with ID ${trackId} not found`);
      }
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const track = SpotifyTrackDetailsSchema.parse(data);

    return {
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album.name,
      albumId: track.album.id,
      releaseYear: track.album.release_date
        ? parseInt(track.album.release_date.split("-")[0], 10)
        : null,
      previewUrl: track.preview_url,
      popularity: track.popularity,
      durationMs: track.duration_ms
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Spotify API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get track recommendations based on seed tracks.
 * Requires 1-5 seed track IDs.
 */
export async function getTrackRecommendations(
  seedTrackIds: string[]
): Promise<TrackSummary[]> {
  if (seedTrackIds.length === 0 || seedTrackIds.length > 5) {
    throw new Error("Must provide 1-5 seed track IDs");
  }

  const token = await getAccessToken();

  const url = new URL(`${SPOTIFY_BASE_URL}/recommendations`);
  url.searchParams.set("seed_tracks", seedTrackIds.join(","));
  url.searchParams.set("limit", "20");
  url.searchParams.set("market", "US");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedToken = null;
        return getTrackRecommendations(seedTrackIds);
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        throw new Error(
          `Spotify API rate limit exceeded. Retry after ${retryAfter || "60"} seconds.`
        );
      }
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const parsed = SpotifyRecommendationsResponseSchema.parse(data);

    return parsed.tracks.map((track) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album.name,
      releaseYear: track.album.release_date
        ? parseInt(track.album.release_date.split("-")[0], 10)
        : null,
      previewUrl: track.preview_url,
      popularity: track.popularity
    }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Spotify API returned unexpected format: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get album information for a track.
 * Useful for finding related content or movie soundtracks.
 */
export async function getTrackAlbum(trackId: string): Promise<{
  albumId: string;
  albumName: string;
  releaseYear: number | null;
  totalTracks: number;
}> {
  const trackDetails = await getTrackDetails(trackId);
  const token = await getAccessToken();

  const url = new URL(`${SPOTIFY_BASE_URL}/albums/${trackDetails.albumId}`);
  url.searchParams.set("market", "US");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        cachedToken = null;
        return getTrackAlbum(trackId);
      }
      throw new Error(`Spotify API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      albumId: data.id,
      albumName: data.name,
      releaseYear: data.release_date
        ? parseInt(data.release_date.split("-")[0], 10)
        : null,
      totalTracks: data.total_tracks || 0
    };
  } catch (error) {
    throw new Error(`Failed to get album info: ${error}`);
  }
}
