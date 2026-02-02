/**
 * Basic unit tests for cross-reference logic.
 * Tests the core functionality of finding connections between movies and songs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { findMoviesWithSong, findSongsInMovie } from "./crossReference";
import * as tmdb from "./tmdb";
import * as spotify from "./spotify";

// Mock the API clients
vi.mock("./tmdb");
vi.mock("./spotify");

describe("Cross-reference logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("findMoviesWithSong", () => {
    it("should return empty array when song is not found on Spotify", async () => {
      vi.mocked(spotify.searchTracks).mockResolvedValue([]);

      const result = await findMoviesWithSong("Nonexistent Song");

      expect(result).toEqual([]);
      expect(spotify.searchTracks).toHaveBeenCalledWith("Nonexistent Song");
    });

    it("should find movies when song exists and matches are found", async () => {
      // Mock Spotify search
      vi.mocked(spotify.searchTracks).mockResolvedValue([
        {
          id: "track-123",
          name: "Bohemian Rhapsody",
          artists: ["Queen"],
          album: "A Night at the Opera",
          releaseYear: 1975,
          previewUrl: null
        }
      ]);

      // Mock TMDB search
      vi.mocked(tmdb.searchMovies).mockResolvedValue([
        {
          id: 1,
          title: "Wayne's World",
          releaseYear: 1992,
          overview: "A movie featuring Bohemian Rhapsody",
          posterUrl: null,
          genres: []
        }
      ]);

      // Mock soundtrack check
      vi.mocked(tmdb.getMovieSoundtrack).mockResolvedValue([
        {
          songTitle: "Bohemian Rhapsody",
          artist: "Queen",
          source: "tmdb_credits"
        }
      ]);

      const result = await findMoviesWithSong("Bohemian Rhapsody", "Queen");

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].matchConfidence).toBe("high");
    });
  });

  describe("findSongsInMovie", () => {
    it("should return empty array when movie is not found", async () => {
      vi.mocked(tmdb.searchMovies).mockResolvedValue([]);

      const result = await findSongsInMovie("Nonexistent Movie");

      expect(result).toEqual([]);
    });

    it("should find songs when movie exists and soundtrack data is available", async () => {
      // Mock TMDB search
      vi.mocked(tmdb.searchMovies).mockResolvedValue([
        {
          id: 1,
          title: "Pulp Fiction",
          releaseYear: 1994,
          overview: "A classic movie",
          posterUrl: null,
          genres: []
        }
      ]);

      // Mock soundtrack data
      vi.mocked(tmdb.getMovieSoundtrack).mockResolvedValue([
        {
          songTitle: "Misirlou",
          artist: "Dick Dale",
          source: "tmdb_credits"
        }
      ]);

      // Mock Spotify search
      vi.mocked(spotify.searchTracks).mockResolvedValue([
        {
          id: "track-456",
          name: "Misirlou",
          artists: ["Dick Dale"],
          album: "Pulp Fiction Soundtrack",
          releaseYear: 1994,
          previewUrl: null
        }
      ]);

      const result = await findSongsInMovie("Pulp Fiction");

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].trackName).toContain("Misirlou");
    });
  });
});
