import { describe, it, expect, vi, beforeEach } from "vitest";
import { tools, executeTool } from "./tools";
import * as tmdb from "../tmdb";
import * as persistence from "../persistence";
import * as semantic from "../semanticRecommendations";

vi.mock("../tmdb");
vi.mock("../persistence");
vi.mock("../semanticRecommendations");

describe("AI tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executes search_movies", async () => {
    vi.mocked(tmdb.searchMovies).mockResolvedValue([
      {
        id: 1,
        title: "Inception",
        releaseYear: 2010,
        overview: "A mind-bending thriller.",
        posterUrl: null,
        genres: ["Sci-Fi"]
      }
    ]);

    const result = await executeTool(
      "search_movies",
      { query: "Inception" },
      "user-1"
    );

    expect(result.error).toBeUndefined();
    expect(tmdb.searchMovies).toHaveBeenCalledWith("Inception");
    expect(result.result).toEqual([
      {
        id: 1,
        title: "Inception",
        releaseYear: 2010,
        overview: "A mind-bending thriller.",
        posterUrl: null,
        genres: ["Sci-Fi"]
      }
    ]);
  });

  it("executes get_semantic_movie_recommendations", async () => {
    vi.mocked(tmdb.getMovieDetails).mockResolvedValue({
      id: 42,
      title: "Interstellar",
      releaseYear: 2014,
      overview: "A space epic.",
      posterUrl: null,
      genres: ["Sci-Fi"],
      topCast: []
    });
    vi.mocked(semantic.getSemanticMovieRecommendations).mockResolvedValue([
      {
        id: 99,
        title: "Arrival",
        releaseYear: 2016,
        overview: "First contact story.",
        posterUrl: null,
        genres: ["Sci-Fi"],
        matchConfidence: "high"
      }
    ]);

    const result = await executeTool(
      "get_semantic_movie_recommendations",
      { movie_id: 42 },
      "user-1"
    );

    expect(result.error).toBeUndefined();
    expect(tmdb.getMovieDetails).toHaveBeenCalledWith(42);
    expect(semantic.getSemanticMovieRecommendations).toHaveBeenCalled();
    expect(result.result).toEqual([
      {
        id: 99,
        title: "Arrival",
        releaseYear: 2016,
        overview: "First contact story.",
        posterUrl: null,
        genres: ["Sci-Fi"],
        matchConfidence: "high"
      }
    ]);
  });

  it("returns a clear error for unknown tools", async () => {
    const result = await executeTool("unknown_tool", {}, "user-1");
    expect(result.result).toBeNull();
    expect(result.error).toContain("Unknown tool");
  });

  it("surfaces tool errors", async () => {
    vi.mocked(tmdb.getMovieDetails).mockRejectedValue(
      new Error("TMDB failure")
    );

    const result = await executeTool(
      "get_movie_details",
      { movie_id: 123 },
      "user-1"
    );

    expect(result.result).toBeNull();
    expect(result.error).toContain("TMDB failure");
  });

  it("executes get_recommendations_from_history", async () => {
    vi.mocked(persistence.getRecommendationsFromHistory).mockResolvedValue({
      movieRecommendations: [
        {
          id: 7,
          title: "Blade Runner 2049",
          releaseYear: 2017,
          overview: "A neo-noir sequel.",
          posterUrl: null,
          genres: ["Sci-Fi"]
        }
      ]
    });

    const result = await executeTool(
      "get_recommendations_from_history",
      { user_id: "user-1" },
      "user-1"
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      movieRecommendations: [
        {
          id: 7,
          title: "Blade Runner 2049",
          releaseYear: 2017,
          overview: "A neo-noir sequel.",
          posterUrl: null,
          genres: ["Sci-Fi"]
        }
      ]
    });
  });
});
